import { getR2 } from "@/lib/db"

export async function GET(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const r2 = await getR2()
  const key = params.path.join("/")
  const obj = await r2.get(key)
  if (!obj) return new Response("Not found", { status: 404 })
  const headers = new Headers()
  headers.set("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream")
  headers.set("Cache-Control", "public, max-age=31536000")
  return new Response(obj.body, { headers })
}

export async function PUT(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const r2 = await getR2()
  const key = params.path.join("/")
  const contentType = req.headers.get("Content-Type") || "application/octet-stream"
  // R2.put needs a body with a known length — buffer the stream into an ArrayBuffer first.
  const body = await req.arrayBuffer()
  await r2.put(key, body, { httpMetadata: { contentType } })
  const publicUrl = `/api/storage/${key}`
  return Response.json({ url: publicUrl, key })
}

export async function DELETE(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const r2 = await getR2()
  await r2.delete(params.path.join("/"))
  return Response.json({ ok: true })
}
