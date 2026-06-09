"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { getItinerary, getItineraryDays, getItineraryHotels, updateItinerary, updateItineraryDay, updateItineraryHotel } from "@/lib/firestore"
import { useAuth } from "@/lib/auth-context"
import { useDialog } from "@/components/dialog-provider"
import { Download, Loader2, MapPin, Calendar, Users, Phone, Mail, FileText, Hotel } from "lucide-react"
import { jsPDF } from "jspdf"

export default function VoucherPage() {
    const params = useParams()
    const itinId = params.id as string
    const { userProfile, loading: authLoading } = useAuth()
    const { showDialog } = useDialog()
    
    // Core states
    const [itin, setItin] = useState<any>(null)
    const [days, setDays] = useState<any[]>([])
    const [hotels, setHotels] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [downloading, setDownloading] = useState(false)
    const [saving, setSaving] = useState(false)

    // Editable guest details & fields states
    const [customerName, setCustomerName] = useState("")
    const [destination, setDestination] = useState("")
    const [customerPhone, setCustomerPhone] = useState("")
    const [customerEmail, setCustomerEmail] = useState("")
    const [startDate, setStartDate] = useState("")
    const [endDate, setEndDate] = useState("")
    const [adults, setAdults] = useState(1)
    const [children, setChildren] = useState(0)
    const [childAge, setChildAge] = useState("")
    
    // Editable duration, days, and hotels states
    const [daysCount, setDaysCount] = useState(1)
    const [nightsCount, setNightsCount] = useState(0)
    const [editableDays, setEditableDays] = useState<any[]>([])
    const [editableHotels, setEditableHotels] = useState<any[]>([])
    
    // Editable textareas states (new line separated)
    const [inclusionsText, setInclusionsText] = useState("")
    const [exclusionsText, setExclusionsText] = useState("")
    const [notesText, setNotesText] = useState("")
    const [termsText, setTermsText] = useState("")
    const [paymentText, setPaymentText] = useState("")
    const [cancellationText, setCancellationText] = useState("")

    useEffect(() => {
        loadData()
    }, [itinId])

    const loadData = async () => {
        try {
            const [itDoc, d, h] = await Promise.all([
                getItinerary(itinId),
                getItineraryDays(itinId),
                getItineraryHotels(itinId),
            ])
            if (!itDoc) {
                setLoading(false)
                return
            }
            const it = itDoc as any
            setItin(it)
            
            // Sort days by day number to ensure correct order
            const sortedDays = d.sort((a: any, b: any) => (a.day || "").localeCompare(b.day || ""))
            setDays(sortedDays)
            setEditableDays(JSON.parse(JSON.stringify(sortedDays)))
            
            setHotels(h)
            setEditableHotels(JSON.parse(JSON.stringify(h)))

            // Initialize states with fetched itinerary details
            setCustomerName(it.customerName || "")
            setDestination(it.destination || "")
            setCustomerPhone(it.customerPhone || "")
            setCustomerEmail(it.customerEmail || "")
            setStartDate(it.startDate || "")
            setEndDate(it.endDate || "")
            setAdults(it.adults || 1)
            setChildren(it.children || 0)
            setChildAge(it.childAge || "")
            setDaysCount(it.days || 1)
            setNightsCount(it.nights || 0)

            // Inclusions
            const incs = it.pdfTemplate?.inclusions || it.inclusions || [
                "Accommodation as per itinerary",
                "Meals as per selected meal plan",
                "All transfers as mentioned",
                "Sightseeing as per itinerary"
            ]
            setInclusionsText(incs.join("\n"))

            // Exclusions
            const excs = it.pdfTemplate?.exclusions || it.exclusions || [
                "Airfare / Train fare",
                "Personal expenses",
                "Any tips or gratuities",
                "Travel insurance",
                "Anything not mentioned in inclusions"
            ]
            setExclusionsText(excs.join("\n"))

            // Important Notes
            const notes = it.pdfTemplate?.importantNotes || []
            setNotesText(notes.join("\n"))

            // Terms
            const terms = it.pdfTemplate?.termsAndConditions || [
                "Outbound Travelers have listed the maximum number of sightseeing that can be covered in a day. However, few places may not be possible to visit due to restrictions by the Govt/ strikes/ heavy snowfall / traffic jams/ limited time /closed roads or monuments/ unforeseen incidents then Outbound Travelers is not liable to provide any kind of claim on above mentioned or similar scenarios.",
                "Guests are requested to have every discussion in written as verbal communications will not be entertained.",
                "Meals Timings must be followed as per the instructed time of the hotels. For any un-availed meals we shall not be responsible.",
                "Final confirmation acceptance should be only written basis & No discount will be provided after the issuance of confirmation letter.",
                "To ensure smooth services, Company can also make alternations in the tour. The reasons for such changes can be acts of god, natural calamity, technical problems, sudden service issues, government policies or any other similar situation.",
                "Extra cost may be applied for any unexpected event. Any cost arising out of natural calamity or political disturbances are born by the passenger directly on the spot.",
                "We may have to re-schedule the sightseeing days due to closing of any monument during that particular day as to ensure smooth execution of tours.",
                "Package will not be considered booked until advance amount have not been received by us.",
                "Travel dates of DND (Date not decided) packages should be affirmed within 3 Months of invoice issuance date. Delays may lead to certain inconveniences.",
                "To give better experiences to our guests, our company also rolls out special offers. This includes upgraded Hotels, Room Category, and Vehicle Type. No additional cost will be levied for such upgrades and this exciting news will be shared with you either before or during the trip.",
                "Check in & Check out time will be according to Hotel Policy. Also, early check in and late check-out scenarios will be subject to availability.",
                "In every package, base category rooms will be reserved in hotels unless until specified by executives.",
                "Due to geographical differences, few places may not have as lavish facilities as that of developed tourist destinations. In such places, Hotels are categorized on the basis of location, services and costing and not as 3 star, 4 Star and so on. The vehicle types are limited and may not be of latest models. Also general infrastructure such as hospitals, petrol pumps, ATMs etc may also be missing. Thus, Guests are requested to be well-prepared for such destinations in advance.",
                "In Hill stations Ac will not be used. (Mostly for the North India & North East Region)",
                "All vehicles hired are on a point to point basis and not on disposal.",
                "Flights, trains, stay arrangements, certain sightseeing, adventure activities or similar services will be subject to ideal weather conditions or Season period.",
                "Any complimentary services (If not provided) cannot be claimed in form of cash or alternative services.",
                "For No Shows or any un-availed service, Outbound Travelers shall not be responsible. This includes missed flights, meals, transfer or any other booked services. For alternative arrangements extra cost will be levied.",
                "Outbound Travelers shall not be responsible for any delays or cancellations due to Heavy Traffic Jams, blocked roads, technical faults, strikes, natural disasters or any unforeseen event. Such situations may also demand for some extra services vis-a-vis extra cost.",
                "Please notify about your complaints or claims within 7 days of \"See Off\" dates as beyond these period issues may not be promptly resolved."
            ]
            setTermsText(terms.join("\n"))

            // Payment Policy
            const payment = it.pdfTemplate?.paymentPolicy || [
                "For Package booking 70% advance payment required. According to hotel policy especially in 4* and 5* we required 100% payment at the time of booking.",
                "Remaining 30% of the package cost will be collected on arrival (First day of the Tour).",
                "For international packages 100% advance payment required at the time of booking.",
                "For Train and Flight 100% advance payment required at the time of booking.",
                "In case of non-payment either advance or remaining the company has full right to stop the Services."
            ]
            setPaymentText(payment.join("\n"))

            // Cancellation Policy
            const cancel = it.pdfTemplate?.cancellationPolicy || [
                "All the cancellations must be communicated in written.",
                "Token amount is non refundable in any cases. Cancellations made 15 Days prior to travel date will attract cancellation charges.",
                "Cancellations charges will vary from 25 % - 50% of the total tour package cost.",
                "100 % Retention charges will be levied for bookings cancelled within 15 days of travel date or No show scenarios.",
                "No refunds will be given in case of missed or unused services. This includes Flights, Trains Hotel stays, meals, sightseeing, transfers, entry ticket, permits or any other services.",
                "Outbound Travelers have the right to cancel your Invoice due to insufficient Advance Amount i.e. 50% of the total tour Package Cost.",
                "In case of unforeseen weather conditions or government restrictions, certain activities may be cancelled and, in such cases, we will try our best to provide an alternate feasible activity. However, no refund will be provided for the same.",
                "100% cancelation would be charged from the total booking amount in case of last-minute booking cancellation due to flight cancellation, any natural calamity, and change in flight schedule/ferry due to technical/weather and high tides and sea conditions."
            ]
            setCancellationText(cancel.join("\n"))

        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        try {
            setSaving(true)
            
            const updatedData = {
                customerName,
                destination,
                customerPhone,
                customerEmail,
                startDate,
                endDate,
                adults: Number(adults) || 1,
                children: Number(children) || 0,
                childAge,
                days: Number(daysCount) || 1,
                nights: Number(nightsCount) || 0,
                pdfTemplate: {
                    ...(itin.pdfTemplate || {}),
                    inclusions: inclusionsText.split("\n").map(s => s.trim()).filter(Boolean),
                    exclusions: exclusionsText.split("\n").map(s => s.trim()).filter(Boolean),
                    importantNotes: notesText.split("\n").map(s => s.trim()).filter(Boolean),
                    termsAndConditions: termsText.split("\n").map(s => s.trim()).filter(Boolean),
                    paymentPolicy: paymentText.split("\n").map(s => s.trim()).filter(Boolean),
                    cancellationPolicy: cancellationText.split("\n").map(s => s.trim()).filter(Boolean)
                }
            }

            // Save parent itinerary updates
            await updateItinerary(itinId, updatedData)
            
            // Save day plans updates
            for (const d of editableDays) {
                if (d.id) {
                    await updateItineraryDay(itinId, d.id, { title: d.title })
                }
            }

            // Save hotel updates
            for (const h of editableHotels) {
                if (h.id) {
                    await updateItineraryHotel(itinId, h.id, {
                        name: h.name || "",
                        hotelName: h.name || "",
                        category: h.category || "Standard",
                        roomCategory: h.roomCategory || "",
                        roomType: h.roomCategory || "",
                        room: h.roomCategory || "",
                        mealPlan: h.mealPlan || "",
                        nights: Number(h.nights) || 0
                    })
                }
            }

            showDialog({
                title: "Success",
                message: "Voucher details updated successfully!",
                type: "success"
            })
            
            setItin((prev: any) => ({
                ...prev,
                ...updatedData
            }))
            setDays(JSON.parse(JSON.stringify(editableDays)))
            setHotels(JSON.parse(JSON.stringify(editableHotels)))
        } catch (err) {
            console.error(err)
            showDialog({
                title: "Error",
                message: "Failed to save voucher details.",
                type: "error"
            })
        } finally {
            setSaving(false)
        }
    }

    const handleDownloadPDF = async () => {
        const element = document.getElementById("voucher-content")
        if (!element) return

        try {
            setDownloading(true)
            // Wait for React to re-render the DOM, replacing all inputs/textareas with static content
            await new Promise((resolve) => setTimeout(resolve, 150))

            const buttons = document.querySelectorAll('.print\\:hidden')
            buttons.forEach((el: any) => el.style.display = 'none')

            const { toJpeg } = await import('html-to-image');
            
            const dataUrl = await toJpeg(element, {
                quality: 0.95,
                backgroundColor: '#ffffff',
                pixelRatio: 3,
                style: {
                    overflow: 'visible',
                    height: 'auto',
                    maxHeight: 'none'
                }
            });

            const pdfWidth = 210 // A4 width in mm
            const pdfHeight = (element.offsetHeight * pdfWidth) / element.offsetWidth

            const pdf = new jsPDF("p", "mm", [pdfWidth, pdfHeight])

            pdf.addImage(dataUrl, "JPEG", 0, 0, pdfWidth, pdfHeight)
            pdf.save(`Voucher-${customerName || itin?.customerName || 'Outbound'}.pdf`)
        } catch (error) {
            console.error("Error generating PDF:", error)
        } finally {
            const buttons = document.querySelectorAll('.print\\:hidden')
            buttons.forEach((el: any) => el.style.display = '')
            setDownloading(false)
        }
    }

    const isPreOps = userProfile?.role === "pre_ops" || userProfile?.role === "pre_ops_lead"
    const isEditing = isPreOps && !downloading

    if (loading || authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#D4AF37', borderTopColor: 'transparent' }} />
                    <p className="font-sans text-sm tracking-widest uppercase" style={{ color: 'rgba(0,0,0,0.6)' }}>Loading Voucher...</p>
                </div>
            </div>
        )
    }

    if (!itin) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <p className="font-sans text-sm text-gray-400">Voucher not found</p>
            </div>
        )
    }

    const formatDate = (dateStr: string) => {
        if (!dateStr) return ""
        try {
            const d = new Date(dateStr)
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        } catch { return dateStr }
    }

    // Dynamic inclusions / exclusions falling back to standard
    const inclusions = itin.pdfTemplate?.inclusions || itin.inclusions || [
        "Accommodation as per itinerary",
        "Meals as per selected meal plan",
        "All transfers as mentioned",
        "Sightseeing as per itinerary"
    ]

    const exclusions = itin.pdfTemplate?.exclusions || itin.exclusions || [
        "Airfare / Train fare",
        "Personal expenses",
        "Any tips or gratuities",
        "Travel insurance",
        "Anything not mentioned in inclusions"
    ]

    return (
        <main className="min-h-screen relative flex justify-center py-10" style={{ scrollBehavior: 'smooth', backgroundColor: '#f9fafb' }}>
            
            {/* Dynamic Floating Action Panel in the bottom-right corner for all roles */}
            <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 print:hidden">
                {isPreOps && (
                    <button
                        onClick={handleSave}
                        disabled={saving || downloading}
                        className="flex items-center gap-2 px-6 py-4 rounded-full font-sans text-sm font-bold tracking-wider uppercase transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl border border-gray-100 bg-white text-[#031A0C]"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                        {saving ? "Saving..." : "Save Voucher"}
                    </button>
                )}
                
                <button
                    onClick={handleDownloadPDF}
                    disabled={downloading || saving}
                    className="flex items-center gap-2 px-6 py-4 rounded-full font-sans text-sm font-bold tracking-wider uppercase transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: '#06a15c', color: '#FFFFFF', boxShadow: '0 8px 32px rgba(6,161,92,0.4)', border: 'none' }}
                >
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {downloading ? "Generating PDF..." : "Download Voucher"}
                </button>
            </div>

            {/* Voucher Document Container - White Paper Style */}
            <div id="voucher-content" className="w-full max-w-[1000px] shadow-2xl overflow-hidden relative" style={{ minHeight: '1414px', backgroundColor: '#ffffff', color: '#111827' }}>

                {/* Header Strip */}
                <div className="h-4 w-full" style={{ background: 'linear-gradient(90deg, #052210 0%, #06a15c 50%, #052210 100%)' }} />

                <div className="p-12 md:p-16">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-12 pb-8" style={{ borderBottom: '1px solid rgba(6,161,92,0.3)' }}>
                        <div className="flex items-center">
                            <img
                                src="/images/outbound png 3.png"
                                alt="Outbound Travelers"
                                data-pdf-logo="true"
                                style={{ 
                                    width: '240px', 
                                    height: 'auto', 
                                    display: 'block', 
                                    objectFit: 'contain',
                                    maxWidth: 'none'
                                }}
                            />
                        </div>
                        <div className="text-right">
                            <h2 className="font-serif text-4xl mb-2" style={{ color: '#06a15c' }}>TRAVEL VOUCHER</h2>
                            <p className="font-sans text-sm font-bold tracking-wider" style={{ color: '#031A0C' }}>REF: OT-{new Date().getFullYear()}-{itin.destination?.substring(0, 3).toUpperCase() || 'TRV'}-{itinId.substring(0, 4).toUpperCase()}</p>
                            <p className="font-sans text-xs mt-1" style={{ color: '#6b7280' }}>Issued Date: {formatDate(itin.updatedAt || new Date().toISOString())}</p>
                        </div>
                    </div>

                    {/* Guest Details */}
                    <div className="mb-12">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(6,161,92,0.1)' }}>
                                <Users className="w-4 h-4" style={{ color: '#06a15c' }} />
                            </div>
                            <h3 className="font-serif text-xl font-bold" style={{ color: '#031A0C' }}>1. Guest Details</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-x-8 gap-y-4 font-sans text-base p-6 rounded-xl" style={{ backgroundColor: '#f9fafb', border: '1px solid #f3f4f6' }}>
                            <div>
                                <span className="block text-sm uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Guest Name</span>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        className="text-lg font-bold w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2.5 py-1 outline-none focus:bg-emerald-50/40 focus:border-emerald-500 font-sans transition-all"
                                        style={{ color: '#111827' }}
                                    />
                                ) : (
                                    <strong className="text-lg" style={{ color: '#111827' }}>{customerName}</strong>
                                )}
                            </div>

                            <div>
                                <span className="block text-sm uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Destination</span>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={destination}
                                        onChange={(e) => setDestination(e.target.value)}
                                        className="text-lg font-bold w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2.5 py-1 outline-none focus:bg-emerald-50/40 focus:border-emerald-500 font-sans transition-all"
                                        style={{ color: '#111827' }}
                                    />
                                ) : (
                                    <strong className="text-lg" style={{ color: '#111827' }}>{destination}</strong>
                                )}
                            </div>

                            <div className="flex flex-col">
                                <span className="block text-sm uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Phone</span>
                                <div className="flex items-center gap-2">
                                    <Phone className="w-4 h-4" style={{ color: '#9ca3af' }} />
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value)}
                                            className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2.5 py-1 text-sm outline-none focus:bg-emerald-50/40 focus:border-emerald-500 font-sans transition-all"
                                            style={{ color: '#111827' }}
                                        />
                                    ) : (
                                        <span style={{ color: '#111827' }}>{customerPhone || "—"}</span>
                                    )}
                                </div>
                            </div>

                            <div>
                                <span className="block text-sm uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Travel Dates</span>
                                {isEditing ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2 py-0.5 outline-none focus:bg-emerald-50/40 focus:border-emerald-500 text-sm font-sans transition-all"
                                            style={{ color: '#111827' }}
                                        />
                                        <span className="text-gray-400">to</span>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2 py-0.5 outline-none focus:bg-emerald-50/40 focus:border-emerald-500 text-sm font-sans transition-all"
                                            style={{ color: '#111827' }}
                                        />
                                    </div>
                                ) : (
                                    <span className="font-semibold" style={{ color: '#1f2937' }}>{formatDate(startDate)} to {formatDate(endDate)}</span>
                                )}
                            </div>

                            <div className="flex flex-col">
                                <span className="block text-sm uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Email</span>
                                <div className="flex items-center gap-2">
                                    <Mail className="w-4 h-4" style={{ color: '#9ca3af' }} />
                                    {isEditing ? (
                                        <input
                                            type="email"
                                            value={customerEmail}
                                            onChange={(e) => setCustomerEmail(e.target.value)}
                                            className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2.5 py-1 text-sm outline-none focus:bg-emerald-50/40 focus:border-emerald-500 font-sans transition-all"
                                            style={{ color: '#111827' }}
                                        />
                                    ) : (
                                        <span style={{ color: '#111827' }}>{customerEmail || "—"}</span>
                                    )}
                                </div>
                            </div>

                            <div>
                                <span className="block text-sm uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Duration</span>
                                {isEditing ? (
                                    <div className="flex items-center gap-2 font-sans">
                                        <input
                                            type="number"
                                            min="1"
                                            value={daysCount}
                                            onChange={(e) => setDaysCount(Math.max(1, Number(e.target.value) || 1))}
                                            className="w-16 bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2 py-0.5 outline-none focus:bg-emerald-50/40 focus:border-emerald-500 text-center font-bold"
                                            style={{ color: '#111827' }}
                                        />
                                        <span className="text-gray-500">Days /</span>
                                        <input
                                            type="number"
                                            min="0"
                                            value={nightsCount}
                                            onChange={(e) => setNightsCount(Math.max(0, Number(e.target.value) || 0))}
                                            className="w-16 bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2 py-0.5 outline-none focus:bg-emerald-50/40 focus:border-emerald-500 text-center font-bold"
                                            style={{ color: '#111827' }}
                                        />
                                        <span className="text-gray-500">Nights</span>
                                    </div>
                                ) : (
                                    <span className="font-semibold text-lg" style={{ color: '#1f2937' }}>{daysCount} Days / {nightsCount} Nights</span>
                                )}
                            </div>

                            <div className="mt-2 pt-4" style={{ borderTop: '1px solid #e5e7eb' }}>
                                <span className="block text-sm uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Trip ID</span>
                                <span className="font-bold text-emerald-600 text-lg">{itin.quoteId || "—"}</span>
                            </div>
                            
                            <div className="mt-2 pt-4" style={{ borderTop: '1px solid #e5e7eb' }}>
                                <span className="block text-sm uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Passengers</span>
                                {isEditing ? (
                                    <div className="flex flex-col gap-2 font-sans text-sm">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="1"
                                                value={adults}
                                                onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
                                                className="w-16 bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2 py-0.5 outline-none focus:bg-emerald-50/40 focus:border-emerald-500 text-center animate-none"
                                                style={{ color: '#111827' }}
                                            />
                                            <span>Adults</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="0"
                                                value={children}
                                                onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
                                                className="w-16 bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2 py-0.5 outline-none focus:bg-emerald-50/40 focus:border-emerald-500 text-center animate-none"
                                                style={{ color: '#111827' }}
                                            />
                                            <span>Children</span>
                                            {children > 0 && (
                                                <input
                                                    type="text"
                                                    placeholder="Ages (e.g. 5, 8)"
                                                    value={childAge}
                                                    onChange={(e) => setChildAge(e.target.value)}
                                                    className="w-32 bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2 py-0.5 outline-none focus:bg-emerald-50/40 focus:border-emerald-500 text-xs ml-2 animate-none"
                                                    style={{ color: '#111827' }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <span className="font-semibold text-lg" style={{ color: '#1f2937' }}>{adults} Adults{children > 0 ? `, ${children} Children (${childAge || 'Age not specified'})` : ''}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Brief Itinerary */}
                    <div className="mb-12">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(6,161,92,0.1)' }}>
                                <Calendar className="w-4 h-4" style={{ color: '#06a15c' }} />
                            </div>
                            <h3 className="font-serif text-xl font-bold" style={{ color: '#031A0C' }}>2. Brief Itinerary</h3>
                        </div>

                        <div className="space-y-4 font-sans text-base border-l-2 ml-4 pl-6 relative" style={{ borderColor: 'rgba(6,161,92,0.3)' }}>
                            {editableDays.map((day, idx) => (
                                <div key={idx} className="relative py-1">
                                    <div className="absolute -left-[31px] top-3.5 w-3 h-3 rounded-full border-2" style={{ backgroundColor: '#ffffff', borderColor: '#06a15c' }} />
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold min-w-[70px] shrink-0" style={{ color: '#06a15c' }}>{day.day}:</span>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={day.title || ""}
                                                onChange={(e) => {
                                                    const newDays = [...editableDays]
                                                    newDays[idx].title = e.target.value
                                                    setEditableDays(newDays)
                                                }}
                                                className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2.5 py-1 text-sm outline-none focus:bg-emerald-50/40 focus:border-emerald-500 font-semibold transition-all"
                                                style={{ color: '#1f2937' }}
                                            />
                                        ) : (
                                            <span className="font-semibold" style={{ color: '#1f2937' }}>{day.title || day.description?.substring(0, 50) + "..."}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {editableDays.length === 0 && (
                                <p className="italic font-sans text-sm text-gray-400">Itinerary details not available.</p>
                            )}
                        </div>
                    </div>

                    {/* Hotel Accommodation */}
                    {hotels.length > 0 && (
                        <div className="mb-12">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(6,161,92,0.1)' }}>
                                    <Hotel className="w-4 h-4" style={{ color: '#06a15c' }} />
                                </div>
                                <h3 className="font-serif text-xl font-bold" style={{ color: '#031A0C' }}>Hotel Accommodation</h3>
                            </div>
                            <div className="space-y-3">
                                {editableHotels.map((hotel: any, idx: number) => {
                                    if (isEditing) {
                                        return (
                                            <div key={idx} className="flex flex-col gap-3 p-5 rounded-xl font-sans" style={{ backgroundColor: '#f9fafb', border: '1px solid #f3f4f6' }}>
                                                <div className="flex flex-wrap items-center gap-4">
                                                    <div className="flex-1 min-w-[200px]">
                                                        <span className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Hotel Name</span>
                                                        <input
                                                            type="text"
                                                            value={hotel.name || hotel.hotelName || ""}
                                                            onChange={(e) => {
                                                                const newHotels = [...editableHotels]
                                                                newHotels[idx].name = e.target.value
                                                                newHotels[idx].hotelName = e.target.value
                                                                setEditableHotels(newHotels)
                                                            }}
                                                            className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2.5 py-1 text-sm font-semibold outline-none focus:bg-emerald-50/40 focus:border-emerald-500 transition-all"
                                                            style={{ color: '#111827' }}
                                                        />
                                                    </div>
                                                    <div className="w-24 shrink-0 text-center">
                                                        <span className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Nights</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={hotel.nights || 0}
                                                            onChange={(e) => {
                                                                const newHotels = [...editableHotels]
                                                                newHotels[idx].nights = Math.max(0, Number(e.target.value) || 0)
                                                                setEditableHotels(newHotels)
                                                            }}
                                                            className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2.5 py-1 text-sm font-semibold text-center outline-none focus:bg-emerald-50/40 focus:border-emerald-500 transition-all"
                                                            style={{ color: '#06a15c' }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                    <div>
                                                        <span className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Category</span>
                                                        <input
                                                            type="text"
                                                            value={hotel.category || "Standard"}
                                                            onChange={(e) => {
                                                                const newHotels = [...editableHotels]
                                                                newHotels[idx].category = e.target.value
                                                                setEditableHotels(newHotels)
                                                            }}
                                                            className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2 py-0.5 text-xs outline-none focus:bg-emerald-50/40 focus:border-emerald-500 transition-all"
                                                            style={{ color: '#4b5563' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Room Category</span>
                                                        <input
                                                            type="text"
                                                            value={hotel.roomCategory || hotel.roomType || hotel.room || ""}
                                                            onChange={(e) => {
                                                                const newHotels = [...editableHotels]
                                                                newHotels[idx].roomCategory = e.target.value
                                                                newHotels[idx].roomType = e.target.value
                                                                newHotels[idx].room = e.target.value
                                                                setEditableHotels(newHotels)
                                                            }}
                                                            className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2 py-0.5 text-xs font-semibold outline-none focus:bg-emerald-50/40 focus:border-emerald-500 transition-all"
                                                            style={{ color: '#06a15c' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Meal Plan</span>
                                                        <input
                                                            type="text"
                                                            value={hotel.mealPlan || ""}
                                                            onChange={(e) => {
                                                                const newHotels = [...editableHotels]
                                                                newHotels[idx].mealPlan = e.target.value
                                                                setEditableHotels(newHotels)
                                                            }}
                                                            className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded px-2 py-0.5 text-xs uppercase outline-none focus:bg-emerald-50/40 focus:border-emerald-500 transition-all"
                                                            style={{ color: '#4b5563' }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    }

                                    return (
                                        <div key={idx} className="flex items-center justify-between p-5 rounded-xl font-sans" style={{ backgroundColor: '#f9fafb', border: '1px solid #f3f4f6' }}>
                                            <div>
                                                <p className="font-bold text-lg" style={{ color: '#111827' }}>{hotel.name || hotel.hotelName || "Unnamed Hotel"}</p>
                                                <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
                                                    {hotel.category || 'Standard'} Or Similar Property
                                                    {(hotel.roomCategory || hotel.roomType || hotel.room) && (
                                                        <span className="ml-2 font-bold" style={{ color: '#06a15c' }}>• {hotel.roomCategory || hotel.roomType || hotel.room}</span>
                                                    )}
                                                    {hotel.mealPlan && (
                                                        <span className="ml-2 opacity-60 uppercase">• {hotel.mealPlan}</span>
                                                    )}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold" style={{ color: '#06a15c' }}>{hotel.nights || 0} Nights</p>
                                                {hotel.ratePerNight && <p className="text-sm" style={{ color: '#6b7280' }}>₹{hotel.ratePerNight}/night</p>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Inclusions & Exclusions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
                        {/* Inclusions */}
                        <div>
                            <div className="flex items-center gap-3 mb-6">
                                <h3 className="font-serif text-xl font-bold uppercase tracking-wider" style={{ color: '#031A0C' }}>3. Inclusions</h3>
                            </div>
                            {isEditing ? (
                                <textarea
                                    value={inclusionsText}
                                    onChange={(e) => setInclusionsText(e.target.value)}
                                    rows={8}
                                    className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded p-3 text-sm outline-none focus:bg-emerald-50/40 focus:border-emerald-500 font-sans transition-all leading-relaxed"
                                    placeholder="Enter inclusions (one per line)..."
                                />
                            ) : (
                                <ul className="space-y-3 font-sans text-base" style={{ color: '#374151' }}>
                                    {inclusionsText.split("\n").map((item: string) => item.trim()).filter(Boolean).map((item: string, idx: number) => (
                                        <li key={idx} className="flex gap-2 items-start">
                                            <span style={{ color: '#06a15c' }}>✓</span>
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Exclusions */}
                        <div>
                            <div className="flex items-center gap-3 mb-6">
                                <h3 className="font-serif text-xl font-bold uppercase tracking-wider" style={{ color: '#031A0C' }}>4. Exclusions</h3>
                            </div>
                            {isEditing ? (
                                <textarea
                                    value={exclusionsText}
                                    onChange={(e) => setExclusionsText(e.target.value)}
                                    rows={8}
                                    className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded p-3 text-sm outline-none focus:bg-emerald-50/40 focus:border-emerald-500 font-sans transition-all leading-relaxed"
                                    placeholder="Enter exclusions (one per line)..."
                                />
                            ) : (
                                <ul className="space-y-3 font-sans text-base" style={{ color: '#374151' }}>
                                    {exclusionsText.split("\n").map((item: string) => item.trim()).filter(Boolean).map((item: string, idx: number) => (
                                        <li key={idx} className="flex gap-2 items-start">
                                            <span style={{ color: '#ef4444' }}>✗</span>
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Terms & Conditions */}
                    <div className="mt-16 pt-12" style={{ borderTop: '1px solid #e5e7eb' }}>
                        <div className="prose max-w-none font-sans text-sm text-justify space-y-8 leading-relaxed" style={{ color: '#4b5563' }}>
                            
                            {/* Important Notes */}
                            <div>
                                <h3 className="font-serif text-2xl font-bold mb-4 uppercase tracking-wider" style={{ color: '#031A0C' }}>Important Notes</h3>
                                {isEditing ? (
                                    <textarea
                                        value={notesText}
                                        onChange={(e) => setNotesText(e.target.value)}
                                        rows={4}
                                        className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded p-3 text-sm outline-none focus:bg-emerald-50/40 focus:border-emerald-500 font-sans transition-all leading-relaxed"
                                        placeholder="Enter important notes (one per line)..."
                                    />
                                ) : (
                                    notesText.trim() && (
                                        <ul className="list-disc pl-4 space-y-2">
                                            {notesText.split("\n").map((term: string) => term.trim()).filter(Boolean).map((term: string, idx: number) => (
                                                <li key={idx} className="whitespace-pre-wrap">{term}</li>
                                            ))}
                                        </ul>
                                    )
                                )}
                            </div>
                            
                            {/* Terms & Conditions */}
                            <div>
                                <h3 className="font-serif text-2xl font-bold mb-4 uppercase tracking-wider" style={{ color: '#031A0C' }}>Terms & Conditions</h3>
                                {isEditing ? (
                                    <textarea
                                        value={termsText}
                                        onChange={(e) => setTermsText(e.target.value)}
                                        rows={10}
                                        className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded p-3 text-sm outline-none focus:bg-emerald-50/40 focus:border-emerald-500 font-sans transition-all leading-relaxed"
                                        placeholder="Enter terms and conditions (one per line)..."
                                    />
                                ) : (
                                    <ul className="list-disc pl-4 space-y-2">
                                        {termsText.split("\n").map((term: string) => term.trim()).filter(Boolean).map((term: string, idx: number) => (
                                            <li key={idx} className="whitespace-pre-wrap">{term}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Payment Policy */}
                            <div>
                                <h4 className="font-bold mt-6 mb-2 uppercase" style={{ color: '#1f2937' }}>PAYMENT POLICY :-</h4>
                                {isEditing ? (
                                    <textarea
                                        value={paymentText}
                                        onChange={(e) => setPaymentText(e.target.value)}
                                        rows={4}
                                        className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded p-3 text-sm outline-none focus:bg-emerald-50/40 focus:border-emerald-500 font-sans transition-all leading-relaxed"
                                        placeholder="Enter payment policy (one per line)..."
                                    />
                                ) : (
                                    <ul className="list-disc pl-4 space-y-1">
                                        {paymentText.split("\n").map((term: string) => term.trim()).filter(Boolean).map((term: string, idx: number) => (
                                            <li key={idx} className="whitespace-pre-wrap">{term}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Cancellation & Refund Policy */}
                            <div>
                                <h4 className="font-bold mt-6 mb-2 uppercase" style={{ color: '#1f2937' }}>CANCELLATION AND REFUND POLICY :-</h4>
                                {isEditing ? (
                                    <textarea
                                        value={cancellationText}
                                        onChange={(e) => setCancellationText(e.target.value)}
                                        rows={6}
                                        className="w-full bg-emerald-50/20 border border-dashed border-emerald-300 rounded p-3 text-sm outline-none focus:bg-emerald-50/40 focus:border-emerald-500 font-sans transition-all leading-relaxed"
                                        placeholder="Enter cancellation policy (one per line)..."
                                    />
                                ) : (
                                    <ul className="list-disc pl-4 space-y-1">
                                        {cancellationText.split("\n").map((term: string) => term.trim()).filter(Boolean).map((term: string, idx: number) => (
                                            <li key={idx} className="whitespace-pre-wrap">{term}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div className="mt-12 mb-8 font-bold text-base" style={{ color: '#1f2937' }}>
                                <p>THANKS AND REGARDS,</p>
                                <p>Operations Team,</p>
                                <p style={{ color: '#06a15c' }}>Outbound Travelers</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}
