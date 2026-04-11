import {
    defineServer,
    defineRoom,
    monitor,
    playground,
    createRouter,
    createEndpoint,
    matchMaker,
} from "colyseus";

/**
 * Import your Room files
 */
import { MyRoom } from "./rooms/MyRoom.js";
import prisma from "./db.js";

const server = defineServer({

    /**
     * Define your room handlers:
     */
    rooms: {
        my_room: defineRoom(MyRoom, { filterBy: ['isPrivate', 'gameMode'] })
    },

    /**
     * Experimental: Define API routes. Built-in integration with the "playground" and SDK.
     * 
     * Usage from SDK: 
     *   client.http.get("/api/hello").then((response) => {})
     * 
     */
    routes: createRouter({
        api_hello: createEndpoint("/api/hello", { method: "GET", }, async (ctx) => {
            return { message: "Hello World" }
        })
    }),

    /**
     * Bind your custom express routes here:
     * Read more: https://expressjs.com/en/starter/basic-routing.html
     */
    express: (app) => {
        // Allow requests from any origin (Vercel, local dev, etc.)
        app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            if (req.method === 'OPTIONS') return res.sendStatus(200);
            next();
        });

        app.get("/hi", (req, res) => {
            res.send("It's time to kick ass and chew bubblegum!");
        });

        // Room listing for browse UI
        app.get("/api/rooms", async (_req, res) => {
            try {
                const rooms = await matchMaker.query({ name: "my_room" });
                res.json(rooms);
            } catch (err) {
                console.error("[api] /api/rooms error:", err);
                res.json([]);
            }
        });

        // ── Player stats API ──────────────────────────────────────────────

        // Sync user record on login (creates or updates username)
        app.post("/api/users/sync", async (req, res) => {
            try {
                const { clerkId, username, email } = req.body ?? {};
                if (!clerkId) return res.status(400).json({ error: "clerkId required" });

                await prisma.user.upsert({
                    where: { clerkId },
                    create: { clerkId, username: username ?? "", email: email ?? "" },
                    update: { username: username ?? "", email: email ?? "" },
                });

                res.json({ ok: true });
            } catch (err) {
                console.error("[api] /api/users/sync error:", err);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        // Fetch a player's cumulative stats
        app.get("/api/stats/:clerkId", async (req, res) => {
            try {
                const { clerkId } = req.params;
                const stats = await prisma.playerStats.findUnique({ where: { clerkId } });

                if (!stats) return res.json(null);

                res.json({
                    total_kills:  stats.totalKills,
                    total_deaths: stats.totalDeaths,
                    total_games:  stats.totalGames,
                    total_wins:   stats.totalWins,
                });
            } catch (err) {
                console.error("[api] /api/stats error:", err);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        /**
         * Use @colyseus/monitor
         * It is recommended to protect this route with a password
         * Read more: https://docs.colyseus.io/tools/monitoring/#restrict-access-to-the-panel-using-a-password
         */
        app.use("/monitor", monitor());

        /**
         * Use @colyseus/playground
         * (It is not recommended to expose this route in a production environment)
         */
        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground());
        }
    }

});

export default server;