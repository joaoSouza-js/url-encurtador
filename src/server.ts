import fastify from "fastify";
import z from "zod"
import { sql } from "./lib/postgress";
import postgres from "postgres";
import { redis } from "./lib/redis";
const API_PORT = 3333
const app = fastify()

app.get("/:code", async (request, reply) => {
    const requestParamsSchema = z.object({
        code: z.string().min(3)
    })
    const { code } = requestParamsSchema.parse(request.params)

    const results = await sql/*sql*/`
        SELECT id, original_url
        FROM short_links
        WHERE short_links.code = ${code}
    `

    if (results.length == 0) {
        return reply.code(404).send({
            error: "Link not found"
        })
    }

    const link = results[0]

    await redis.zincrby('metrics', 1, String(link.id))

    return reply.redirect(301, link.original_url)





})

app.get("/api/metrics", async (request, reply) => {
    const results = await redis.zrangebyscore('metrics', 0, 50, 'WITHSCORES')
    const metrics : {id: string, value: number}[] = []
    for (let index = 0; index < results.length; index += 2) {
        const id = results[index];
        const value = parseInt(results[index + 1]);
        metrics.push({ id, value });
    }

      const metricsSorted = metrics.sort((a, b) => b.value - a.value)
        .map(link => {
             return {
                 shortLink: link.id,
                 clicks: link.value
             }
        })
    
    return reply.send(metricsSorted)

})

app.get("/api/links", async (request, reply) => {
    try {
        const results = await sql/*sql*/`
        SELECT * 
        FROM short_links
        ORDER BY create_at DESC
        `
        reply.send(results)
    } catch (error) {
        return error
    }

})



app.post("/api/links", async (request, reply) => {
    const createLinkSchema = z.object({
        code: z.string().min(3),
        url: z.string().url(),
    })
    const { code, url } = createLinkSchema.parse(request.body)

    try {
        const result = await sql/*sql*/`
    INSERT INTO short_links (code, original_url) 
    VALUES (${code}, ${url})
    RETURNING id
`

        const link = result[0]

        reply.status(201).send({ shortLinkId: link })
    } catch (error) {
        if (error instanceof postgres.PostgresError) {
            if (error.code === "23505") {
                return reply.status(409).send({ message: "Code already in use" })
            }
            return error
        }
        console.log(error)

        return reply.status(500).send({ message: 'internal sever error' })
    }



})

app.listen({
    port: API_PORT
})
    .then(() => {
        console.log(`index'm running on http://localhost:${API_PORT}`)
    })
    .catch(error => {
        console.error(error)
        process.exit(1)
    })