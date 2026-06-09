import { NextResponse } from "next/server"
import { getDestinations, getHotels, updateHotel } from "@/lib/firestore"

export async function GET(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  try {
    const { hotelId } = params
    if (!hotelId) return NextResponse.json({ error: "Hotel ID is required" }, { status: 400 })

    const dests = await getDestinations()
    let hotel: any = null
    for (const d of dests) {
      const hotels = await getHotels(d.id)
      hotel = hotels.find((h: any) => h.id === hotelId)
      if (hotel) break
    }
    if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 })

    const master = hotel.roomCategories || []
    const custom = hotel.custom_room_categories || []
    const merged: any[] = [...master]
    const seen = new Set(master.map((r: any) => r.roomType?.toLowerCase().trim()))
    for (const r of custom) {
      const key = r.roomType?.toLowerCase().trim()
      if (key && !seen.has(key)) { seen.add(key); merged.push(r) }
    }
    return NextResponse.json(merged)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(request: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  try {
    const { hotelId } = params
    const { name } = await request.json()
    if (!name?.trim()) return NextResponse.json({ error: "Room category name is required" }, { status: 400 })
    const trimmedName = name.trim()

    const dests = await getDestinations()
    let hotel: any = null
    let destId = ""
    for (const d of dests) {
      const hotels = await getHotels(d.id)
      const found = hotels.find((h: any) => h.id === hotelId)
      if (found) { hotel = found; destId = d.id; break }
    }
    if (!hotel || !destId) return NextResponse.json({ error: "Hotel not found" }, { status: 404 })

    const master = hotel.roomCategories || []
    const custom = hotel.custom_room_categories || []
    if ([...master, ...custom].some((r: any) => r.roomType?.toLowerCase().trim() === trimmedName.toLowerCase())) {
      return NextResponse.json({ error: "Category already exists" }, { status: 400 })
    }
    const newCategory = { roomType: trimmedName, epPrice:0, cpPrice:0, mapPrice:0, apPrice:0, cwbPrice:0, cnbPrice:0, extraBedPrice:0 }
    await updateHotel(destId, hotelId, { custom_room_categories: [...custom, newCategory] })
    return NextResponse.json(newCategory, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to add" }, { status: 500 })
  }
}
