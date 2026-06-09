"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useDialog } from "@/components/dialog-provider"
import { toast } from "@/hooks/use-toast"
import {
    getDestinations, getHotels, getAttractions, getActivities, getVehicleRules, getPresetDays,
    createItinerary, addItineraryDay, addItineraryHotel, addItineraryTransfer, addItineraryPricing, addItineraryFlight, addItineraryActivity,
    getItinerary, getItineraryDays, getItineraryFlights, getItineraryHotels, getItineraryTransfers, getItineraryPricing, getItineraryActivities, updateItinerary, clearItinerarySubcollections, getTransfers,
    createPackage, addPackageDay, addPackageFlight, addPackageHotel, addPackageTransfer, addPackageActivity, addPackagePricing, getPackage, getPackageDays, getPackageHotels, getPackageTransfers, getPackagePricing, getPackageFlights, getPackageActivities, updatePackage, clearPackageSubcollections, getCustomers, createCustomer, getSettings
} from "@/lib/firestore"
import { DEFAULT_WEIGHTS, buildComposition, computeWeightedSplit, parseAgeYears, type PaxWeights } from "@/lib/pricing-weights"
import { calcDmcPricing, resolveProfileKey, PRICING_PROFILES } from "@/lib/trip-type"
// Firebase Storage replaced by Cloudflare R2 via /api/storage/*
import {
    User, MapPin, Calendar, Users, Hotel, Car, Sun, DollarSign,
    ChevronRight, ChevronLeft, Check, Plus, Trash2, Eye, Plane, Upload, Loader2, Sparkles, Map, PackageSearch, ChevronDown, X, Search, Star, FileText, RotateCcw, AlertTriangle, GripVertical
} from "lucide-react"
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd"
import { createWorker } from "tesseract.js"
import { preprocessImageForOCR } from "@/lib/image-processing"
import { extractFlightDetailsFromText } from "@/lib/flight-parser"
import { HOTEL_CATEGORIES } from "@/lib/constants"

const STEPS = [
    { label: "Customer & Trip", icon: User },
    { label: "Flights", icon: Plane },
    { label: "Hotels", icon: Hotel },
    { label: "Transfers", icon: Car },
    { label: "Activities", icon: Map },
    { label: "Day Plan", icon: Sun },
    { label: "Inclusions", icon: FileText },
    { label: "Pricing", icon: DollarSign },
    { label: "Preview", icon: Eye },
]

export interface ItineraryWizardProps {
    mode?: "custom" | "package"
    onSave?: (id: string) => void
}

const COUNTRY_CODES = [
    { code: "+91", country: "India", flag: "🇮🇳" },
    { code: "+1", country: "United States", flag: "🇺🇸" },
    { code: "+44", country: "United Kingdom", flag: "🇬🇧" },
    { code: "+971", country: "United Arab Emirates", flag: "🇦🇪" },
    { code: "+65", country: "Singapore", flag: "🇸🇬" },
    { code: "+60", country: "Malaysia", flag: "🇲🇾" },
    { code: "+66", country: "Thailand", flag: "🇹🇭" },
    { code: "+61", country: "Australia", flag: "🇦🇺" },
    { code: "+64", country: "New Zealand", flag: "🇳🇿" },
    { code: "+966", country: "Saudi Arabia", flag: "🇸🇦" },
    { code: "+974", country: "Qatar", flag: "🇶🇦" },
    { code: "+965", country: "Kuwait", flag: "🇰🇼" },
    { code: "+968", country: "Oman", flag: "🇴🇲" },
    { code: "+973", country: "Bahrain", flag: "🇧🇭" },
    { code: "+880", country: "Bangladesh", flag: "🇧🇩" },
    { code: "+977", country: "Nepal", flag: "🇳🇵" },
    { code: "+94", country: "Sri Lanka", flag: "🇱🇰" },
    { code: "+960", country: "Maldives", flag: "🇲🇻" },
    { code: "+62", country: "Indonesia", flag: "🇮🇩" },
    { code: "+63", country: "Philippines", flag: "🇵🇭" },
    { code: "+84", country: "Vietnam", flag: "🇻🇳" },
    { code: "+86", country: "China", flag: "🇨🇳" },
    { code: "+81", country: "Japan", flag: "🇯🇵" },
    { code: "+82", country: "South Korea", flag: "🇰🇷" },
    { code: "+7", country: "Russia", flag: "🇷🇺" },
    { code: "+27", country: "South Africa", flag: "🇿🇦" },
    { code: "+20", country: "Egypt", flag: "🇪🇬" },
    { code: "+254", country: "Kenya", flag: "🇰🇪" },
    { code: "+33", country: "France", flag: "🇫🇷" },
    { code: "+49", country: "Germany", flag: "🇩🇪" },
    { code: "+39", country: "Italy", flag: "🇮🇹" },
    { code: "+34", country: "Spain", flag: "🇪🇸" },
    { code: "+41", country: "Switzerland", flag: "🇨🇭" },
    { code: "+31", country: "Netherlands", flag: "🇳🇱" },
    { code: "+32", country: "Belgium", flag: "🇧🇪" },
    { code: "+43", country: "Austria", flag: "🇦🇹" },
    { code: "+46", country: "Sweden", flag: "🇸🇪" },
    { code: "+47", country: "Norway", flag: "🇳🇴" },
    { code: "+45", country: "Denmark", flag: "🇩🇰" },
    { code: "+353", country: "Ireland", flag: "🇮🇪" },
    { code: "+351", country: "Portugal", flag: "🇵🇹" },
    { code: "+90", country: "Turkey", flag: "🇹🇷" },
    { code: "+30", country: "Greece", flag: "🇬🇷" },
    { code: "+48", country: "Poland", flag: "🇵🇱" },
    { code: "+380", country: "Ukraine", flag: "🇺🇦" },
    { code: "+420", country: "Czech Republic", flag: "🇨🇿" },
    { code: "+36", country: "Hungary", flag: "🇭🇺" },
    { code: "+40", country: "Romania", flag: "🇷🇴" },
    { code: "+359", country: "Bulgaria", flag: "🇧🇬" },
    { code: "+385", country: "Croatia", flag: "🇭🇷" },
    { code: "+92", country: "Pakistan", flag: "🇵🇰" },
    { code: "+93", country: "Afghanistan", flag: "🇦🇫" },
    { code: "+962", country: "Jordan", flag: "🇯🇴" },
    { code: "+961", country: "Lebanon", flag: "🇱🇧" },
    { code: "+963", country: "Syria", flag: "🇸🇾" },
    { code: "+964", country: "Iraq", flag: "🇮🇶" },
    { code: "+967", country: "Yemen", flag: "🇾🇪" },
    { code: "+972", country: "Israel", flag: "🇮🇱" },
    { code: "+95", country: "Myanmar", flag: "🇲🇲" },
    { code: "+855", country: "Cambodia", flag: "🇰🇭" },
    { code: "+856", country: "Laos", flag: "🇱🇦" },
    { code: "+992", country: "Tajikistan", flag: "🇹🇯" },
    { code: "+993", country: "Turkmenistan", flag: "🇹🇲" },
    { code: "+994", country: "Azerbaijan", flag: "🇦🇿" },
    { code: "+995", country: "Georgia", flag: "🇬🇪" },
    { code: "+996", country: "Kyrgyzstan", flag: "🇰🇬" },
    { code: "+998", country: "Uzbekistan", flag: "🇺🇿" },
    { code: "+374", country: "Armenia", flag: "🇦🇲" },
    { code: "+375", country: "Belarus", flag: "🇧🇾" },
    { code: "+370", country: "Lithuania", flag: "🇱🇹" },
    { code: "+371", country: "Latvia", flag: "🇱🇻" },
    { code: "+372", country: "Estonia", flag: "🇪🇪" },
    { code: "+352", country: "Luxembourg", flag: "🇱🇺" },
    { code: "+354", country: "Iceland", flag: "🇮🇸" },
    { code: "+356", country: "Malta", flag: "🇲🇹" },
    { code: "+357", country: "Cyprus", flag: "🇨🇾" },
    { code: "+55", country: "Brazil", flag: "🇧🇷" },
    { code: "+54", country: "Argentina", flag: "🇦🇷" },
    { code: "+57", country: "Colombia", flag: "🇨🇴" },
    { code: "+56", country: "Chile", flag: "🇨🇱" },
    { code: "+51", country: "Peru", flag: "🇵🇪" },
    { code: "+58", country: "Venezuela", flag: "🇻🇪" },
    { code: "+593", country: "Ecuador", flag: "🇪🇨" },
    { code: "+595", country: "Paraguay", flag: "🇵🇾" },
    { code: "+598", country: "Uruguay", flag: "🇺🇾" },
    { code: "+591", country: "Bolivia", flag: "🇧🇴" },
    { code: "+52", country: "Mexico", flag: "🇲🇽" },
    { code: "+506", country: "Costa Rica", flag: "🇨🇷" },
    { code: "+507", country: "Panama", flag: "🇵🇦" },
    { code: "+502", country: "Guatemala", flag: "🇬🇹" },
    { code: "+503", country: "El Salvador", flag: "🇸🇻" },
    { code: "+504", country: "Honduras", flag: "🇭🇳" },
    { code: "+505", country: "Nicaragua", flag: "🇳🇮" },
    { code: "+53", country: "Cuba", flag: "🇨🇺" },
    { code: "+509", country: "Haiti", flag: "🇭🇹" },
    { code: "+592", country: "Guyana", flag: "🇬🇾" },
    { code: "+597", country: "Suriname", flag: "🇸🇷" },
    { code: "+212", country: "Morocco", flag: "🇲🇦" },
    { code: "+213", country: "Algeria", flag: "🇩🇿" },
    { code: "+216", country: "Tunisia", flag: "🇹🇳" },
    { code: "+218", country: "Libya", flag: "🇱🇾" },
    { code: "+234", country: "Nigeria", flag: "🇳🇬" },
    { code: "+233", country: "Ghana", flag: "🇬🇭" },
    { code: "+251", country: "Ethiopia", flag: "🇪🇹" },
    { code: "+255", country: "Tanzania", flag: "🇹🇿" },
    { code: "+256", country: "Uganda", flag: "🇺🇬" },
    { code: "+244", country: "Angola", flag: "🇦🇴" },
    { code: "+237", country: "Cameroon", flag: "🇨🇲" },
    { code: "+225", country: "Ivory Coast", flag: "🇨🇮" },
    { code: "+221", country: "Senegal", flag: "🇸🇳" },
    { code: "+263", country: "Zimbabwe", flag: "🇿🇼" },
    { code: "+260", country: "Zambia", flag: "🇿🇲" },
    { code: "+265", country: "Malawi", flag: "🇲🇼" },
    { code: "+250", country: "Rwanda", flag: "🇷🇼" },
    { code: "+264", country: "Namibia", flag: "🇳🇦" },
    { code: "+267", country: "Botswana", flag: "🇧🇼" },
    { code: "+230", country: "Mauritius", flag: "🇲🇺" },
    { code: "+248", country: "Seychelles", flag: "🇸🇨" },
    { code: "+261", country: "Madagascar", flag: "🇲🇬" },
    { code: "+211", country: "South Sudan", flag: "🇸🇸" },
    { code: "+249", country: "Sudan", flag: "🇸🇩" },
    { code: "+252", country: "Somalia", flag: "🇸🇴" },
    { code: "+253", country: "Djibouti", flag: "🇩🇯" },
    { code: "+291", country: "Eritrea", flag: "🇪🇷" },
    { code: "+220", country: "Gambia", flag: "🇬🇲" },
    { code: "+232", country: "Sierra Leone", flag: "🇸🇱" },
    { code: "+231", country: "Liberia", flag: "🇱🇷" },
    { code: "+228", country: "Togo", flag: "🇹🇬" },
    { code: "+229", country: "Benin", flag: "🇧🇯" },
    { code: "+226", country: "Burkina Faso", flag: "🇧🇫" },
    { code: "+223", country: "Mali", flag: "🇲🇱" },
    { code: "+227", country: "Niger", flag: "🇳🇪" },
    { code: "+235", country: "Chad", flag: "🇹🇩" },
    { code: "+236", country: "Central African Republic", flag: "🇨🇫" },
    { code: "+241", country: "Gabon", flag: "🇬🇦" },
    { code: "+242", country: "Congo", flag: "🇨🇬" },
    { code: "+243", country: "DR Congo", flag: "🇨🇩" },
    { code: "+240", country: "Equatorial Guinea", flag: "🇬🇶" },
    { code: "+257", country: "Burundi", flag: "🇧🇮" },
    { code: "+238", country: "Cape Verde", flag: "🇨🇻" },
    { code: "+239", country: "Sao Tome", flag: "🇸🇹" },
    { code: "+266", country: "Lesotho", flag: "🇱🇸" },
    { code: "+268", country: "Eswatini", flag: "🇸🇿" },
    { code: "+679", country: "Fiji", flag: "🇫🇯" },
    { code: "+685", country: "Samoa", flag: "🇼🇸" },
    { code: "+676", country: "Tonga", flag: "🇹🇴" },
    { code: "+678", country: "Vanuatu", flag: "🇻🇺" },
    { code: "+677", country: "Solomon Islands", flag: "🇸🇧" },
    { code: "+692", country: "Marshall Islands", flag: "🇲🇭" },
    { code: "+691", country: "Micronesia", flag: "🇫🇲" },
    { code: "+680", country: "Palau", flag: "🇵🇼" },
    { code: "+686", country: "Kiribati", flag: "🇰🇮" },
    { code: "+674", country: "Nauru", flag: "🇳🇷" },
    { code: "+688", country: "Tuvalu", flag: "🇹🇻" },
    { code: "+673", country: "Brunei", flag: "🇧🇳" },
    { code: "+670", country: "Timor-Leste", flag: "🇹🇱" },
    { code: "+675", country: "Papua New Guinea", flag: "🇵🇬" },
    { code: "+886", country: "Taiwan", flag: "🇹🇼" },
    { code: "+850", country: "North Korea", flag: "🇰🇵" },
    { code: "+852", country: "Hong Kong", flag: "🇭🇰" },
    { code: "+853", country: "Macau", flag: "🇲🇴" }
]

export function ItineraryWizard({ mode = "custom", onSave }: ItineraryWizardProps) {
    const { userProfile } = useAuth()
    const { showDialog } = useDialog()
    const router = useRouter()
    const searchParams = useSearchParams()
    const editId = searchParams.get("editId")
    const [step, setStep] = useState(0)
    const [saving, setSaving] = useState(false)
    // Holds the id of the auto-created "Not Completed" draft once page 1 (Trip Basics) is
    // completed, so later steps + the final Save update that same record instead of duplicating.
    const [draftId, setDraftId] = useState<string | null>(null)
    const [isEditingItinerary, setIsEditingItinerary] = useState(false)
    const [itinModule, setItinModule] = useState<string | null>(null)
    const [calMonth, setCalMonth] = useState(() => new Date())
    const [pickingEnd, setPickingEnd] = useState(false)

    // Destination data
    const [destinations, setDestinations] = useState<any[]>([])
    const [destHotels, setDestHotels] = useState<any[]>([])
    const [destAttractions, setDestAttractions] = useState<any[]>([])
    const [destActivities, setDestActivities] = useState<any[]>([])
    const [destVehicles, setDestVehicles] = useState<any[]>([])
    const [destTransfers, setDestTransfers] = useState<any[]>([])
    const [destPresetDays, setDestPresetDays] = useState<any[]>([])
    const [customers, setCustomers] = useState<any[]>([])

    // Step 1: Customer & Trip
    const [customerName, setCustomerName] = useState("")
    const [customerPhone, setCustomerPhone] = useState("")
    const [customerEmail, setCustomerEmail] = useState("")
    const [destinationId, setDestinationId] = useState("")
    const [destinationName, setDestinationName] = useState("")
    const [startDate, setStartDate] = useState("")
    const [endDate, setEndDate] = useState("")
    const [nights, setNights] = useState(0)
    const [totalDays, setTotalDays] = useState(0)
    const [adults, setAdults] = useState(2)
    const [children, setChildren] = useState(0)
    const [childAges, setChildAges] = useState<string[]>([])
    // Per-child bed type ("with" | "without") for weighted pricing; infants (<5) ignore it.
    const [childBedTypes, setChildBedTypes] = useState<string[]>([])
    // Per-passenger pricing weights, loaded from admin Settings ("pricing"); adult is always 1.
    const [paxWeights, setPaxWeights] = useState<PaxWeights>(DEFAULT_WEIGHTS)
    // DMC-based pricing: the salesperson enters ONE DMC amount per option (keyed by the
    // option/category). Margin, GST and TCS are auto-derived from the destination profile.
    const [dmcAmounts, setDmcAmounts] = useState<Record<string, number>>({})
    const [consultantName, setConsultantName] = useState("")
    const [consultantPhone, setConsultantPhone] = useState("")
    
    // UI Split Phone States
    const [customerCountryCode, setCustomerCountryCode] = useState("+91")
    const [customerPhoneNum, setCustomerPhoneNum] = useState("")
    const [countrySearch, setCountrySearch] = useState("+91")
    const [countryDropdownOpen, setCountryDropdownOpen] = useState(false)

    const splitPhoneNumber = (full: string) => {
        if (!full) return { code: "+91", num: "" }
        const cleaned = full.trim()
        
        // If it doesn't start with '+', it represents an old record without country code prefix
        if (!cleaned.startsWith("+")) {
            return { code: "+91", num: cleaned }
        }

        // Sort calling codes by length descending to match longest code first (e.g. +1242 before +1)
        const sortedCodes = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length)
        const match = sortedCodes.find(c => cleaned.startsWith(c.code))
        if (match) {
            return { code: match.code, num: cleaned.slice(match.code.length) }
        }

        // Fallback for manually typed custom codes (e.g. up to 4 digits starting with +)
        const customMatch = cleaned.match(/^\+\d{1,4}/)
        if (customMatch) {
            const manualCode = customMatch[0]
            return { code: manualCode, num: cleaned.slice(manualCode.length) }
        }

        return { code: "+91", num: cleaned }
    }
    
    // Validation Errors
    const [errors, setErrors] = useState({
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        destination: "",
        dates: "",
        adults: "",
    })
    // Save-time validation dialog listing the incomplete mandatory fields.
    const [validationModal, setValidationModal] = useState<{ open: boolean; missing: { label: string; fieldId: string }[] }>({ open: false, missing: [] })

    const validateName = (name: string) => {
        if (!name) return "Customer name is required"
        if (name.length < 2) return "Name must be at least 2 characters"
        if (name.length > 50) return "Name must be at most 50 characters"
        if (!/^[a-zA-Z\s.]+$/.test(name)) return "Name must contain only letters, spaces, or dot."
        return ""
    }

    const validatePhone = (phoneNum: string) => {
        const phoneToValidate = phoneNum ? phoneNum.trim() : "";
        if (!phoneToValidate) return "Phone number is required"
        const phoneRegex = /^\d{7,15}$/
        if (!phoneRegex.test(phoneToValidate)) return "Enter a valid 7-15 digit phone number"
        return ""
    }

    const validateEmail = (email: string) => {
        if (!email) return ""
        const trimmed = email.trim()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Enter a valid email address."
        return ""
    }

    // Smooth-scroll to a field container and focus its first input (for invalid-field guidance).
    const scrollToField = (fieldId: string) => {
        setTimeout(() => {
            const el = document.getElementById(fieldId)
            if (!el) return
            el.scrollIntoView({ behavior: "smooth", block: "center" })
            const focusable = el.querySelector("input, select, textarea") as HTMLElement | null
            focusable?.focus()
        }, 80)
    }

    // Validate Step 0 (Customer & Trip) — the only step with mandatory fields. Reuses the
    // existing field validators and returns both the error map and the ordered list of
    // missing fields (label + DOM id) for messaging, scroll and focus. No business logic.
    const validateStep0 = () => {
        const e = {
            customerName: validateName(customerName),
            customerPhone: validatePhone(customerPhoneNum),
            customerEmail: validateEmail(customerEmail),
            destination: destinationId ? "" : "Please select a destination",
            dates: (startDate && endDate) ? "" : "Please select your travel dates",
            adults: (adults && adults >= 1) ? "" : "At least 1 adult is required",
            consultantName: consultantName.trim() ? "" : "Consultant name is required",
            consultantPhone: consultantPhone.trim() ? "" : "Consultant phone is required",
        }
        const missing: { label: string; fieldId: string }[] = []
        if (e.customerName) missing.push({ label: mode === "package" ? "Package Name / Customer Name" : "Customer Name", fieldId: "wizard-field-customerName" })
        if (e.customerPhone) missing.push({ label: "Phone Number", fieldId: "wizard-field-phone" })
        if (e.customerEmail) missing.push({ label: "Email", fieldId: "wizard-field-email" })
        if (e.destination) missing.push({ label: "Destination", fieldId: "wizard-field-destination" })
        if (e.dates) missing.push({ label: "Travel Dates", fieldId: "wizard-field-dates" })
        if (e.adults) missing.push({ label: "Number of Adults", fieldId: "wizard-field-adults" })
        if (e.consultantName) missing.push({ label: "Consultant Name", fieldId: "wizard-field-consultantName" })
        if (e.consultantPhone) missing.push({ label: "Consultant Phone", fieldId: "wizard-field-consultantPhone" })
        return { errors: e, missing }
    }

    // Per-step validation. Only Step 0 carries mandatory fields today; other steps pass
    // through unchanged so no existing workflow is altered.
    const validateStepFields = (stepNum: number): { errors: any; missing: { label: string; fieldId: string }[] } => {
        if (stepNum === 0) return validateStep0()
        return { errors: null, missing: [] }
    }

    // The moment page 1 (Trip Basics) is completed, persist a partial booking flagged
    // `incomplete: true` so it appears in the pipeline's Draft column tagged "Not Completed".
    // No button — this fires automatically. The final Save reuses this id (see handleSave)
    // and clears the flag, so a finished itinerary loses the tag.
    const autoSaveDraft = async () => {
        if (editId || draftId) return
        const selectedDest = destinations.find((d: any) => d.id === destinationId)
        const draftData = {
            destinationId, destination: destinationName,
            startDate, endDate, nights, days: totalDays,
            adults, children, childAge: childAges.join(", "), childBedTypes: childBedTypes.join(", "),
            margin,
            createdBy: userProfile?.uid || null,
            createdByName: userProfile?.name || "",
            pdfTemplate: selectedDest?.pdfTemplate || null,
            customerName, customerPhone, customerEmail,
            consultantName, consultantPhone,
            module: mode === "package" ? "built-package" : "custom-itinerary",
            status: "draft",
            incomplete: true,
            extra: { incomplete: true, childBedTypes: childBedTypes.join(", ") },
        }
        try {
            const id = await createItinerary(draftData)
            setDraftId(id)
        } catch (e) {
            console.error("Auto-draft save failed", e)
        }
    }

    // Next-button handler: block advancing while the current step has invalid mandatory fields.
    const goToNextStep = () => {
        const { errors: stepErrs, missing } = validateStepFields(step)
        if (missing.length > 0) {
            if (stepErrs) setErrors(prev => ({ ...prev, ...stepErrs }))
            toast({
                title: "Missing required fields",
                description: "Please complete all mandatory fields before proceeding.",
                variant: "destructive",
            })
            scrollToField(missing[0].fieldId)
            return
        }
        // Completing page 1 → auto-save as a "Not Completed" draft (new bookings only).
        if (step === 0 && !editId && !draftId) autoSaveDraft()
        setStep(Math.min(STEPS.length - 1, step + 1))
    }

    // Hotel Search
    const [hotelSearchTerm, setHotelSearchTerm] = useState("")
    const [expandedHotelId, setExpandedHotelId] = useState<string | null>(null)

    // Step 2: Hotels
    const [selectedHotels, setSelectedHotels] = useState<any[]>([])
    const [selectedHotelCategory, setSelectedHotelCategory] = useState<string>("All")
    const [customHotelName, setCustomHotelName] = useState("")
    const [customHotelCategory, setCustomHotelCategory] = useState("")
    const [customRoomCategory, setCustomRoomCategory] = useState("")

    // Step 3: Transfers
    const [transfers, setTransfers] = useState<any[]>([{ type: "Arrival", pickup: "", drop: "", vehicleType: "", price: 0 }])

    // Step 4: Activities
    const [selectedActivities, setSelectedActivities] = useState<any[]>([])

    // Step 5: Day Plan
    const [dayPlans, setDayPlans] = useState<any[]>([])

    // Step 6: Inclusions & Notes
    const [overrideInclusions, setOverrideInclusions] = useState<string[] | null>(null)
    const [overrideExclusions, setOverrideExclusions] = useState<string[] | null>(null)
    const [overrideImportantNotes, setOverrideImportantNotes] = useState<string[] | null>(null)
    const [overrideTermsConditions, setOverrideTermsConditions] = useState<string[] | null>(null)
    const [overridePaymentPolicy, setOverridePaymentPolicy] = useState<string[] | null>(null)
    const [overrideCancellationPolicy, setOverrideCancellationPolicy] = useState<string[] | null>(null)
    const [inclusionsCustomised, setInclusionsCustomised] = useState(false)
    const [inclusionsSeeded, setInclusionsSeeded] = useState(false)
    const [expandedIncSections, setExpandedIncSections] = useState<Record<string, boolean>>({
        inclusions: true, exclusions: true,
        importantNotes: false, termsConditions: false,
        paymentPolicy: false, cancellationPolicy: false,
    })

    // Step 7: Pricing & Plans
    const [margin, setMargin] = useState(15)
    // Legacy single-price fallbacks
    const [totalPrice, setTotalPrice] = useState(0)
    const [perPersonPrice, setPerPersonPrice] = useState(0)
    // Manual Cost Overrides - Defaulting to 0 for a clean slate as requested
    const [manualHotelCost, setManualHotelCost] = useState<number | null>(0)
    const [manualTransferCost, setManualTransferCost] = useState<number | null>(0)
    const [manualActivityCost, setManualActivityCost] = useState<number | null>(0)
    // Per-plan hotel cost overrides (indexed by plan idx)
    const [planHotelCostOverrides, setPlanHotelCostOverrides] = useState<(number | null)[]>([])

    const [externalItinerary, setExternalItinerary] = useState<any>(null)
    const [uploadingExternalItinerary, setUploadingExternalItinerary] = useState(false)

    const handleExternalItineraryUpload = async (file: File) => {
        const pathId = editId || `temp_${Date.now()}`
        const storagePath = `external_itineraries/${pathId}/${encodeURIComponent(file.name)}`
        setUploadingExternalItinerary(true)
        try {
            const res = await fetch(`/api/storage/${storagePath}`, {
                method: "PUT",
                body: file,
                headers: { "Content-Type": file.type || "application/octet-stream" },
            })
            if (!res.ok) throw new Error("Upload failed")
            const { url } = await res.json()
            const metadata = {
                name: file.name,
                type: file.name.split('.').pop()?.toLowerCase() || 'unknown',
                size: file.size,
                url,
                storagePath,
                uploadedAt: new Date().toISOString()
            }
            setExternalItinerary(metadata)
            toast({ title: "Upload Successful", description: "External itinerary has been attached." })
        } catch (err: any) {
            console.error("External Itinerary Upload Error:", err)
            toast({
                title: "Upload Failed",
                description: "Could not upload file: " + (err.message || JSON.stringify(err)),
                variant: "destructive"
            })
        } finally {
            setUploadingExternalItinerary(false)
        }
    }

    // New Multi-Plan Architecture
    const [plans, setPlans] = useState<any[]>([])
    const [tierPlans, setTierPlans] = useState<any[]>([
        { name: "Budget", stops: [{ location: "", hotelId: "", hotelName: "", nights: 2, mealPlan: "CP (Breakfast)", roomType: "", ratePerNight: 0, numberOfRooms: 1, numberOfExtraBeds: 0 }] }
    ])

    const MEAL_PLANS = [
        { label: "EP (No Meals)", value: "EP" },
        { label: "CP (Breakfast)", value: "CP" },
        { label: "MAP (Breakfast + Dinner)", value: "MAP" },
        { label: "AP (All Meals)", value: "AP" }
    ]

    const TIER_NAMES = HOTEL_CATEGORIES

    // Sync tierPlans to selectedHotels for backward compatibility with pricing/saving logic
    useEffect(() => {
        const flattened: any[] = []
        tierPlans.forEach((plan, planIdx) => {
            // Pricing groups per OPTION (by position), so each option stays one price even
            // when its hotels have different per-hotel categories.
            const groupKey = `Option ${planIdx + 1}`
            plan.stops.forEach((stop: any) => {
                if (stop.hotelId || stop.hotelName) {
                    const hotel = destHotels.find(h => h.id === stop.hotelId) || {
                        id: stop.hotelId || `custom-${Date.now()}`,
                        name: stop.hotelName,
                        hotelName: stop.hotelName,
                        category: groupKey,
                        roomType: stop.roomType || "",
                        ratePerNight: stop.ratePerNight || 0
                    }

                    flattened.push({
                        ...hotel,
                        category: groupKey, // group by option for pricing
                        hotelCategory: stop.category || "", // per-hotel category (display)
                        selectedNights: stop.nights,
                        mealPlan: stop.mealPlan,
                        roomType: stop.roomType || hotel.roomType || "",
                        roomCategory: stop.roomType || hotel.roomType || "",
                        ratePerNight: stop.ratePerNight || 0,
                        location: stop.location || hotel.location || "",
                        starRating: stop.starRating || hotel.starRating || 3,
                        numberOfRooms: stop.numberOfRooms !== undefined ? Number(stop.numberOfRooms) : 1,
                        numberOfExtraBeds: stop.numberOfExtraBeds !== undefined ? Number(stop.numberOfExtraBeds) : 0,
                        childWithoutBed: stop.childWithoutBed !== undefined ? Number(stop.childWithoutBed) : 0
                    })
                }
            })
        })
        setSelectedHotels(flattened)
    }, [tierPlans, destHotels])

    // Dropdown management
    const [openHotelDropdown, setOpenHotelDropdown] = useState<number | null>(null)
    const [openLocDropdown, setOpenLocDropdown] = useState<number | null>(null)
    const [openPresetDropdown, setOpenPresetDropdown] = useState<number | null>(null)
    const [localHotelSearch, setLocalHotelSearch] = useState("")
    const [localLocSearch, setLocalLocSearch] = useState("")
    const [localPresetSearch, setLocalPresetSearch] = useState("")

    // Tier Builder specific dropdowns
    const [openTierLocDropdown, setOpenTierLocDropdown] = useState<{ planIdx: number, stopIdx: number } | null>(null)
    const [openTierHotelDropdown, setOpenTierHotelDropdown] = useState<{ planIdx: number, stopIdx: number } | null>(null)

    // TypeScript strict interface declarations
    interface RoomCategory {
        roomType: string;
        epPrice: number;
        cpPrice: number;
        mapPrice: number;
        apPrice: number;
        cwbPrice?: number;
        cnbPrice?: number;
        extraBedPrice?: number;
        starRating?: number;
    }

    interface DestinationHotel {
        id: string;
        name?: string;
        hotelName?: string;
        category?: string;
        address?: string;
        location?: string;
        starRating?: number;
        cpPrice?: number;
        epPrice?: number;
        mapPrice?: number;
        apPrice?: number;
        ratePerNight?: number;
        roomCategories?: RoomCategory[];
    }

    // Room category combobox state and helpers
    const [openTierRoomDropdown, setOpenTierRoomDropdown] = useState<{ planIdx: number, stopIdx: number } | null>(null)
    const [localRoomSearch, setLocalRoomSearch] = useState("")
    const [hotelRoomCategories, setHotelRoomCategories] = useState<Record<string, RoomCategory[]>>({})
    const [loadingRooms, setLoadingRooms] = useState<Record<string, boolean>>({})
    const [openUpward, setOpenUpward] = useState<Record<string, boolean>>({});
    const roomDropdownRef = useRef<Record<string, HTMLDivElement | null>>({});

    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (openTierRoomDropdown) {
                const key = `${openTierRoomDropdown.planIdx}-${openTierRoomDropdown.stopIdx}`;
                const container = roomDropdownRef.current[key];
                if (container && !container.contains(e.target as Node)) {
                    setOpenTierRoomDropdown(null);
                }
            }
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [openTierRoomDropdown]);

    const fetchRoomCategories = async (hotelId: string): Promise<void> => {
        if (!hotelId || hotelId.startsWith("custom-") || hotelId === "undefined" || hotelId === "null") return;
        setLoadingRooms(prev => ({ ...prev, [hotelId]: true }));
        try {
            const res = await fetch(`/api/hotels/${hotelId}/room-categories`);
            if (res.ok) {
                const data: RoomCategory[] = await res.json();
                setHotelRoomCategories(prev => ({ ...prev, [hotelId]: data }));
            }
        } catch (err) {
            console.error("Error fetching room categories:", err);
        } finally {
            setLoadingRooms(prev => ({ ...prev, [hotelId]: false }));
        }
    };

    const getAvailableCategories = (hotelId: string): RoomCategory[] => {
        if (!hotelId) return [];
        const hotel = destHotels.find((h: DestinationHotel) => h.id === hotelId);
        const master: RoomCategory[] = hotel?.roomCategories || [];
        const custom: RoomCategory[] = hotelRoomCategories[hotelId] || [];
        const merged: RoomCategory[] = [...master];
        const seen = new Set(master.map((r: RoomCategory) => r.roomType?.toLowerCase().trim()));
        for (const r of custom) {
            const key = r.roomType?.toLowerCase().trim();
            if (key && !seen.has(key)) {
                seen.add(key);
                merged.push(r);
            }
        }
        return merged.filter((r: RoomCategory) => {
            const rt = (r.roomType || "").trim();
            return rt && rt !== "+" && rt !== "Standard / Default" && rt !== "Standard";
        });
    };

    const selectRoomCategory = (planIdx: number, stopIdx: number, val: string): void => {
        const newPlans = [...tierPlans];
        newPlans[planIdx].stops[stopIdx].roomType = val;
        
        const hotelId: string = newPlans[planIdx].stops[stopIdx].hotelId;
        const categories = getAvailableCategories(hotelId);
        const room = categories.find((r: RoomCategory) => r.roomType === val);
        
        if (room) {
            const mp: string = newPlans[planIdx].stops[stopIdx].mealPlan || "CP (Breakfast)";
            if (mp.startsWith("EP")) newPlans[planIdx].stops[stopIdx].ratePerNight = room.epPrice || 0;
            else if (mp.startsWith("CP")) newPlans[planIdx].stops[stopIdx].ratePerNight = room.cpPrice || 0;
            else if (mp.startsWith("MAP")) newPlans[planIdx].stops[stopIdx].ratePerNight = room.mapPrice || 0;
            else if (mp.startsWith("AP")) newPlans[planIdx].stops[stopIdx].ratePerNight = room.apPrice || 0;
            
            const hotel = destHotels.find((h: DestinationHotel) => h.id === hotelId);
            newPlans[planIdx].stops[stopIdx].starRating = hotel?.starRating || room.starRating || 3;
        }
        
        setTierPlans(newPlans);
    };

    const handleAddRoomCategory = async (planIdx: number, stopIdx: number, rawHotelId: string | null | undefined, name: string): Promise<void> => {
        const trimmed = name.trim();
        if (!trimmed) return;

        // Resolve correct hotelId if it was not resolved at selection time (e.g. chosen by typing name)
        const stop = tierPlans[planIdx]?.stops[stopIdx];
        const stopHotelName: string = stop?.hotelName || "";

        let hotelId = rawHotelId || "";
        if (!hotelId || hotelId === "undefined" || hotelId === "null" || hotelId.startsWith("custom-")) {
            const matchedHotel = destHotels.find((h: DestinationHotel) => 
                (h.hotelName || h.name || "").toLowerCase().trim() === stopHotelName.toLowerCase().trim()
            );
            if (matchedHotel && matchedHotel.id) {
                hotelId = matchedHotel.id;
                // Proactively update the stop's hotelId so it stays synced
                const newPlans = [...tierPlans];
                newPlans[planIdx].stops[stopIdx].hotelId = matchedHotel.id;
                setTierPlans(newPlans);
            }
        }

        const existing = getAvailableCategories(hotelId);
        if (existing.some((r: RoomCategory) => r.roomType?.toLowerCase().trim() === trimmed.toLowerCase())) {
            toast({
                title: "Validation Error",
                description: "Category already exists",
                variant: "destructive"
            });
            return;
        }

        const newCat: RoomCategory = {
            roomType: trimmed,
            epPrice: 0,
            cpPrice: 0,
            mapPrice: 0,
            apPrice: 0,
            cwbPrice: 0,
            cnbPrice: 0,
            extraBedPrice: 0,
        };

        // Guard before API call: If still no database ID or custom hotel, save only in local state - FIX 3 & FIX 4
        if (!hotelId || hotelId.startsWith("custom-") || hotelId === "undefined" || hotelId === "null") {
            setHotelRoomCategories(prev => ({
                ...prev,
                [hotelId]: [...(prev[hotelId] || []), newCat]
            }));
            selectRoomCategory(planIdx, stopIdx, trimmed);
            setOpenTierRoomDropdown(null);
            return;
        }

        // hotelId exists — safe to call API
        setLoadingRooms(prev => ({ ...prev, [hotelId]: true }));
        try {
            const res = await fetch(`/api/hotels/${hotelId}/room-categories`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmed }),
            });
            if (res.ok) {
                const createdCat: RoomCategory = await res.json();
                setHotelRoomCategories(prev => ({
                    ...prev,
                    [hotelId]: [...(prev[hotelId] || []), createdCat]
                }));
                
                selectRoomCategory(planIdx, stopIdx, trimmed);
                setOpenTierRoomDropdown(null);
            } else {
                const errData = await res.json();
                toast({
                    title: "Error",
                    description: errData.error || "Failed to add category",
                    variant: "destructive"
                });
            }
        } catch (err) {
            console.error("Network error adding category:", err);
            toast({
                title: "Network Error",
                description: "Failed to save category. Please try again.",
                variant: "destructive"
            });
        } finally {
            setLoadingRooms(prev => ({ ...prev, [hotelId]: false }));
        }
    };

    // Fetch room categories for all hotels in tierPlans
    useEffect(() => {
        tierPlans.forEach(plan => {
            plan.stops.forEach((stop: any) => {
                if (stop.hotelId && !stop.hotelId.startsWith("custom-") && stop.hotelId !== "undefined" && stop.hotelId !== "null" && !hotelRoomCategories[stop.hotelId] && !loadingRooms[stop.hotelId]) {
                    fetchRoomCategories(stop.hotelId);
                }
            });
        });
    }, [tierPlans, destHotels]);

    // Flight details storage
    const [flightSegments, setFlightSegments] = useState<any[]>([])
    const [isExtractingFlight, setIsExtractingFlight] = useState(false)

    const processFlightImage = async (file: File): Promise<void> => {
        setIsExtractingFlight(true)
        try {
            // 1. Process image client-side to improve OCR accuracy
            const processedBase64 = await preprocessImageForOCR(file)

            // 2. Initialize Tesseract WebWorker dynamically
            const worker = await createWorker('eng', 1, {
                logger: m => console.log(m) // Optional: Track progress
            })

            // 3. Extract Text via WebAssembly Worker
            const { data: { text } } = await worker.recognize(processedBase64)
            await worker.terminate()

            // 4. Parse raw text into structured flight details (can be multiple if round trip)
            const parsedSegs = extractFlightDetailsFromText(text)

            // 5. ML / Data Classification Validation: Verify if the extracted data actually represents a flight
            const isValidTicket = parsedSegs && parsedSegs.length > 0 && parsedSegs.some(seg =>
                (seg.airline && seg.airline.length > 1) ||
                (seg.fromCode && seg.toCode) ||
                (seg.departure && seg.arrival)
            )

            if (!isValidTicket) {
                toast({
                    title: "OCR Error",
                    description: "Data not matched. This does not appear to be a valid flight ticket screenshot.",
                    variant: "destructive"
                })
                setIsExtractingFlight(false)
                return
            }

            const newSegments = parsedSegs.map(data => ({
                type: data.type || "Onward",
                airline: data.airline || "",
                flightNo: data.flightNo || "",
                fromCode: data.fromCode || "",
                from: "",
                departure: data.departure || "",
                departureDate: "",
                toCode: data.toCode || "",
                to: "",
                arrival: data.arrival || "",
                arrivalDate: "",
                duration: data.duration || "",
                flightType: data.flightType || "Direct",
                layoverDetails: data.layoverDetails || "",
                price: Number(data.price) || 0
            }))

            setFlightSegments(prev => {
                // If there is only one empty segment, replace it. Otherwise append.
                if (prev.length === 1 && !prev[0].airline && !prev[0].departure && !prev[0].fromCode) {
                    return newSegments
                }
                return [...prev, ...newSegments]
            })

            setIsExtractingFlight(false)
        } catch (err) {
            console.error("Tesseract Error:", err)
            toast({
                title: "OCR Failed",
                description: "Could not process image automatically. You can enter details manually.",
                variant: "destructive"
            })
            setIsExtractingFlight(false)
        }
    }

    const handleFlightScreenshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        await processFlightImage(file)
    }

    // Global Paste Listener for flights step
    useEffect(() => {
        const handleGlobalPaste = async (e: ClipboardEvent) => {
            if (step !== 1 || isExtractingFlight) return; // Only process pastes when on Flights step and not already processing
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        e.preventDefault();
                        await processFlightImage(file);
                        return;
                    }
                }
            }
        };
        window.addEventListener('paste', handleGlobalPaste);
        return () => window.removeEventListener('paste', handleGlobalPaste);
    }, [step, isExtractingFlight]);

    useEffect(() => { loadDestinations() }, [])

    // Consultant = the logged-in user (auto-fetched). Fill for new bookings; on edits keep
    // whatever was saved unless it's blank (then fall back to the current user).
    useEffect(() => {
        if (!userProfile) return
        setConsultantName(prev => prev || userProfile.name || "")
        setConsultantPhone(prev => prev || userProfile.phone || "")
    }, [userProfile])

    useEffect(() => {
        if (destinationId) loadDestinationData(destinationId)
    }, [destinationId])

    // Load existing itinerary or package if edit mode
    useEffect(() => {
        if (!editId) return
        const loadEditData = async () => {
            try {
                let it, d, h, t, p, f, a;
                let isItin = false;
                if (mode === "package") {
                    // A build-package edit can be opened with EITHER a package id or an itinerary
                    // id (the pipeline's Edit button passes the itinerary id). getPackage() throws
                    // 404 for an itinerary id — so guard it. Without this guard the whole load
                    // aborts and every field comes back blank.
                    it = await (getPackage(editId) as Promise<any>).catch(() => null)
                    if (it) {
                        [d, h, t, p, f, a] = await Promise.all([
                            getPackageDays(editId) as Promise<any[]>,
                            getPackageHotels(editId) as Promise<any[]>,
                            getPackageTransfers(editId) as Promise<any[]>,
                            getPackagePricing(editId) as Promise<any[]>,
                            getPackageFlights(editId) as Promise<any[]>,
                            getPackageActivities(editId) as Promise<any[]>,
                        ])
                    } else {
                        isItin = true;
                        [it, d, h, t, p, f, a] = await Promise.all([
                            getItinerary(editId) as Promise<any>,
                            getItineraryDays(editId) as Promise<any[]>,
                            getItineraryHotels(editId) as Promise<any[]>,
                            getItineraryTransfers(editId) as Promise<any[]>,
                            getItineraryPricing(editId) as Promise<any[]>,
                            getItineraryFlights(editId) as Promise<any[]>,
                            getItineraryActivities(editId) as Promise<any[]>,
                        ])
                    }
                } else {
                    isItin = true;
                    [it, d, h, t, p, f, a] = await Promise.all([
                        getItinerary(editId) as Promise<any>,
                        getItineraryDays(editId) as Promise<any[]>,
                        getItineraryHotels(editId) as Promise<any[]>,
                        getItineraryTransfers(editId) as Promise<any[]>,
                        getItineraryPricing(editId) as Promise<any[]>,
                        getItineraryFlights(editId) as Promise<any[]>,
                        getItineraryActivities(editId) as Promise<any[]>,
                    ])
                }
                setIsEditingItinerary(isItin);

                if (it) {
                    setItinModule(it.module || null)
                    setCustomerName(it.customerName || it.packageName || "")
                    setCustomerPhone(it.customerPhone || "")
                    const split = splitPhoneNumber(it.customerPhone || "")
                    setCustomerCountryCode(split.code)
                    setCountrySearch(split.code)
                    setCustomerPhoneNum(split.num)
                    setCustomerEmail(it.customerEmail || "")
                    setDestinationId(it.destinationId || "")
                    setDestinationName(it.destination || "")
                    setStartDate(it.startDate || "")
                    setEndDate(it.endDate || "")
                    setAdults(it.adults || 2)
                    setChildren(it.children || 0)
                    const loadChildAgesStr = it.childAge || ""
                    setChildAges(loadChildAgesStr ? loadChildAgesStr.split(", ") : [])
                    const loadBedTypesStr = it.childBedTypes || ""
                    setChildBedTypes(loadBedTypesStr ? loadBedTypesStr.split(", ") : [])
                    // Fall back to the logged-in user so the consultant never shows blank.
                    setConsultantName(it.consultantName || userProfile?.name || "")
                    setConsultantPhone(it.consultantPhone || userProfile?.phone || "")
                    setMargin(it.margin || 15)
                    // Restore the per-option DMC amounts (keyed by option/category) so the
                    // DMC-based pricing recomputes identically on edit.
                    if (Array.isArray(it.plans)) {
                        const dmcMap: Record<string, number> = {}
                        it.plans.forEach((p: any) => {
                            if (p?.category) dmcMap[p.category] = Number(p.costBreakup?.dmc ?? p.dmcCost ?? 0)
                        })
                        if (Object.keys(dmcMap).length) setDmcAmounts(dmcMap)
                    }
                    setExternalItinerary(it.externalItinerary || null)

                    // Restore Inclusions & Notes overrides
                    if (it.override_inclusions !== undefined) {
                        setOverrideInclusions(it.override_inclusions)
                        setOverrideExclusions(it.override_exclusions || null)
                        setOverrideImportantNotes(it.override_important_notes || null)
                        setOverrideTermsConditions(it.override_terms_conditions || null)
                        setOverridePaymentPolicy(it.override_payment_policy || null)
                        setOverrideCancellationPolicy(it.override_cancellation_policy || null)
                        setInclusionsCustomised(it.inclusions_customised || false)
                        setInclusionsSeeded(true)
                    }
                }

                if (p && p.length > 0) {
                    const pricing = p[0]
                    setManualHotelCost(pricing.manualHotelCost !== undefined ? pricing.manualHotelCost : null)
                    setManualTransferCost(pricing.manualTransferCost !== undefined ? pricing.manualTransferCost : null)
                    setManualActivityCost(pricing.manualActivityCost !== undefined ? pricing.manualActivityCost : null)
                }

                if (f && f.length > 0) setFlightSegments(f)
                if (h && h.length > 0) {
                    // Preserve the order the hotels were entered in (sortOrder), so editing
                    // and the PDF both keep Hotel 1, Hotel 2... as the salesperson arranged them.
                    h = h.map((hotel: any, i: number) => ({ hotel, i }))
                        .sort((a: any, b: any) => (a.hotel.sortOrder ?? a.i) - (b.hotel.sortOrder ?? b.i))
                        .map((x: any) => x.hotel)
                    setSelectedHotels(h)
                    // Reconstruct tierPlans from selected hotels
                    const categories = Array.from(new Set(h.map((hotel: any) => hotel.category || "BUDGET")))
                    const reconstructed = categories.map(cat => ({
                        name: cat,
                        stops: h.filter((hotel: any) => (hotel.category || "BUDGET") === cat).map((hotel: any) => ({
                            location: hotel.subDestination || hotel.location || "",
                            hotelId: hotel.id,
                            hotelName: hotel.hotelName || hotel.name,
                            nights: hotel.selectedNights || 1,
                            mealPlan: hotel.mealPlan || "CP (Breakfast)",
                            roomType: hotel.roomType || "",
                            ratePerNight: hotel.ratePerNight || 0,
                            starRating: hotel.starRating || 3,
                            numberOfRooms: hotel.numberOfRooms !== undefined ? Number(hotel.numberOfRooms) : 1,
                            numberOfExtraBeds: hotel.numberOfExtraBeds !== undefined ? Number(hotel.numberOfExtraBeds) : 0,
                            childWithoutBed: hotel.childWithoutBed !== undefined ? Number(hotel.childWithoutBed) : 0,
                            category: hotel.hotelCategory || ""
                        }))
                    }))
                    setTierPlans(reconstructed.length > 0 ? reconstructed : [{ name: "Budget", stops: [{ location: "", hotelId: "", hotelName: "", nights: 2, mealPlan: "CP (Breakfast)", roomType: "", ratePerNight: 0, numberOfRooms: 1, numberOfExtraBeds: 0 }] }])
                }
                if (t && t.length > 0) setTransfers(t.map((tr: any, i: number) => ({ tr, i })).sort((a: any, b: any) => (a.tr.sortOrder ?? a.i) - (b.tr.sortOrder ?? b.i)).map((x: any) => x.tr))
                if (a && a.length > 0) setSelectedActivities(a)
                if (d && d.length > 0) {
                    // Sort days by day number to ensure chronological order (Day 01, Day 02...)
                    const sortedDays = [...d].sort((a, b) => {
                        const numA = parseInt(a.day?.replace(/\D/g, '') || "0")
                        const numB = parseInt(b.day?.replace(/\D/g, '') || "0")
                        return numA - numB
                    })
                    // Slight delay to ensure it overrides any auto-generation from startDate/endDate changes
                    setTimeout(() => setDayPlans(sortedDays), 100)
                }
            } catch (e) {
                console.error(e)
            }
        }
        loadEditData()
    }, [editId, mode])

    useEffect(() => {
        if (startDate && endDate) {
            const start = new Date(startDate)
            const end = new Date(endDate)
            const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
            setNights(diffDays)
            setTotalDays(diffDays + 1)
            // Auto-generate day plans only if we don't have existing ones in edit mode, or if user is changing dates
            if (!editId || dayPlans.length !== diffDays + 1) {
                const plans = []
                for (let i = 0; i < diffDays + 1; i++) {
                    const date = new Date(start)
                    date.setDate(date.getDate() + i)
                    plans.push({
                        day: `Day ${String(i + 1).padStart(2, "0")}`,
                        date: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
                        title: i === 0 ? "Arrival" : i === diffDays ? "Departure" : "",
                        description: "",
                        highlights: [] as string[],
                        subDestination: "",
                        overnightStay: ""
                    })
                }
                setDayPlans(plans)
            }
        }
    }, [startDate, endDate])

    const loadDestinations = async () => {
        const dests = await getDestinations()
        setDestinations(dests)
        try {
            const custs = await getCustomers()
            setCustomers(custs)
        } catch (e) {
            console.error("Failed to load customers", e)
        }
    }

    const loadDestinationData = async (id: string) => {
        const [hotels, attractions, activities, vehicles, presetDays, transfers] = await Promise.all([
            getHotels(id), getAttractions(id), getActivities(id), getVehicleRules(id), getPresetDays(id), getTransfers(id)
        ])
        setDestHotels(hotels)
        setDestAttractions(attractions)
        setDestActivities(activities)
        setDestVehicles(vehicles)
        setDestPresetDays(presetDays)
        setDestTransfers(transfers)
    }

    // Helper: count children whose age is between 5 and 12 (inclusive)
    const getEligibleChildrenCount = (ages: string[]): number => {
        return ages.filter(ageStr => {
            if (!ageStr) return false
            const lower = ageStr.toLowerCase()
            const match = lower.match(/\d+(\.\d+)?/)
            if (!match) return false
            let years = parseFloat(match[0])
            // If the age is given in months (e.g. "12 months"), convert to years
            // so an infant isn't mistaken for a 12-year-old. "yr"/"year" wins if both appear.
            const isMonths = /month|\bmos?\b/.test(lower) && !/year|yr/.test(lower)
            if (isMonths) years = years / 12
            return years >= 5 && years <= 12
        }).length
    }

    // Load the agency-wide pricing weights once (admin sets these in Settings → "pricing").
    useEffect(() => {
        getSettings("pricing").then((s: any) => {
            if (!s) return
            setPaxWeights({
                adult: 1,
                childWithBed: typeof s.childWithBed === "number" ? s.childWithBed : DEFAULT_WEIGHTS.childWithBed,
                childNoBed: typeof s.childNoBed === "number" ? s.childNoBed : DEFAULT_WEIGHTS.childNoBed,
                infant: typeof s.infant === "number" ? s.infant : DEFAULT_WEIGHTS.infant,
            })
        }).catch(() => {})
    }, [])

    const calculatePricing = () => {
        const pax = adults + children
        // Head-count composition for the weighted per-passenger split.
        const comp = buildComposition(adults, childAges, childBedTypes, children)
        const eligCount = comp.childrenWithBed + comp.childrenNoBed
        const selectedDest = destinations.find((d: any) => d.id === destinationId)

        // Build one priced plan from a DMC amount: profile margin → GST → TCS → grand total,
        // then split the grand total across passengers by weight (TCS/GST baked into each head).
        const buildPlan = (planId: string, planName: string, category: string, dmcVal: number) => {
            const pr = calcDmcPricing(dmcVal, selectedDest)
            const total = pr.grandTotal
            const split = computeWeightedSplit(total, comp, paxWeights)
            return {
                planId, planName, category,
                perPersonPrice: pax > 0 ? Math.round(total / pax) : total,
                totalPrice: total,
                eligibleChildrenCount: eligCount,
                perAdultPrice: split.perAdult,
                perChildPrice: split.perChildWithBed, // legacy = child-with-bed
                perChildWithBedPrice: split.perChildWithBed,
                perChildNoBedPrice: split.perChildNoBed,
                perInfantPrice: split.perInfant,
                adultsCount: comp.adults,
                childWithBedCount: comp.childrenWithBed,
                childNoBedCount: comp.childrenNoBed,
                infantCount: comp.infants,
                dmcCost: dmcVal,
                costBreakup: {
                    dmc: dmcVal,
                    profileKey: pr.profileKey,
                    profileLabel: pr.profileLabel,
                    marginPct: pr.marginPct,
                    margin: pr.profitAmount,
                    packageValue: pr.packageValue,
                    gst: pr.gst,
                    tcs: pr.tcs,
                },
            }
        }

        if (selectedHotels.length === 0) {
            const plan = buildPlan("plan_1", "No Hotel Selected", "Custom", dmcAmounts["Custom"] || 0)
            setTotalPrice(plan.totalPrice)
            setPerPersonPrice(plan.perPersonPrice)
            setPlans([plan])
        } else {
            const categories = Array.from(new Set(selectedHotels.map(h => h.category || "Uncategorized")))
            const newPlans = categories.map((cat, idx) =>
                buildPlan(`plan_${idx + 1}`, `PLAN ${idx + 1} - ${cat}`, cat, dmcAmounts[cat] || 0))
            setTotalPrice(newPlans[0].totalPrice)
            setPerPersonPrice(newPlans[0].perPersonPrice)
            setPlans(newPlans)
        }
    }

    useEffect(() => { calculatePricing() }, [selectedHotels, dmcAmounts, destinationId, destinations, nights, adults, children, childAges, childBedTypes, paxWeights])

    const handleSave = async (asDraft = false): Promise<void> => {
        // --- FULL VALIDATION CHECK ---
        // A normal save requires all mandatory fields — on failure we surface a dialog and
        // do NOT save. "Save as Draft" (asDraft) bypasses this and saves the partial booking
        // flagged `incomplete: true`, so it appears in the pipeline's Draft column tagged.
        const { errors: stepErrs, missing } = validateStep0()
        if (!asDraft && missing.length > 0) {
            setErrors(prev => ({ ...prev, ...stepErrs }))
            setValidationModal({ open: true, missing })
            return
        }
        const isIncomplete = missing.length > 0

        setSaving(true)
        try {
            const selectedDest = destinations.find((d: any) => d.id === destinationId)
            
            // Clean highlights - trim and remove empty ones before saving
            const cleanedDayPlans = dayPlans.map(day => ({
                ...day,
                highlights: day.highlights?.map((h: string) => h.trim()).filter((h: string) => h.length > 0) || []
            }))

            const baseData = {
                destinationId, destination: destinationName,
                startDate, endDate, nights, days: totalDays,
                adults, children, childAge: childAges.join(", "), childBedTypes: childBedTypes.join(", "),
                margin,
                createdBy: userProfile?.uid || null,
                createdByName: userProfile?.name || "",
                pdfTemplate: selectedDest?.pdfTemplate || null,
                manualHotelCost, manualTransferCost, manualActivityCost,
                override_inclusions: overrideInclusions,
                override_exclusions: overrideExclusions,
                override_important_notes: overrideImportantNotes,
                override_terms_conditions: overrideTermsConditions,
                override_payment_policy: overridePaymentPolicy,
                override_cancellation_policy: overrideCancellationPolicy,
                inclusions_customised: inclusionsCustomised,
                module: mode === "package" ? "built-package" : "custom-itinerary",
                plans: plans,
                selectedPlanId: plans.length > 0 ? plans[0].planId : null,
                externalItinerary: externalItinerary || null,
                // Mark partial saves so the pipeline can tag them "Not Completed".
                // Stored both top-level (PUT folds to extra) and in extra (POST persists it).
                incomplete: isIncomplete,
                extra: { incomplete: isIncomplete, childBedTypes: childBedTypes.join(", ") },
            }

            let itinId = editId as string
            let pipelineItinIdForOnSave: string | null = null

            if (mode === "package" && !isEditingItinerary) {
                const packageData = {
                    ...baseData,
                    packageName: customerName,
                }
                console.log("SAVE PACKAGE PAYLOAD:", packageData);
                if (editId) {
                    await updatePackage(editId, packageData)
                    await clearPackageSubcollections(editId)
                } else {
                    itinId = await createPackage(packageData)
                }

                for (const day of cleanedDayPlans) await addPackageDay(itinId, day)
                for (const flight of flightSegments) await addPackageFlight(itinId, flight)
                for (let hi = 0; hi < selectedHotels.length; hi++) await addPackageHotel(itinId, { ...selectedHotels[hi], sortOrder: hi })
                for (let ti = 0; ti < transfers.length; ti++) await addPackageTransfer(itinId, { ...transfers[ti], sortOrder: ti })
                for (const act of selectedActivities) await addPackageActivity(itinId, act)
                await addPackagePricing(itinId, { totalPrice, perPersonPrice, margin, nights, adults, children, plans, manualHotelCost, manualTransferCost, manualActivityCost })

                // DUAL WRITE: Also create an itinerary so it immediately shows up in the Sales Pipeline
                if (!editId) {
                    const itineraryDataForPipeline = {
                        ...baseData,
                        customerName, customerPhone, customerEmail,
                        consultantName, consultantPhone,
                        module: "built-package",
                    }
                    console.log("SAVE PIPELINE PAYLOAD:", itineraryDataForPipeline);
                    // Reuse the auto-created "Not Completed" draft so the finished package
                    // updates that same pipeline card (clearing its tag) instead of duplicating.
                    let pipelineItinId: string
                    if (draftId) {
                        await updateItinerary(draftId, itineraryDataForPipeline)
                        await clearItinerarySubcollections(draftId)
                        pipelineItinId = draftId
                    } else {
                        pipelineItinId = await createItinerary(itineraryDataForPipeline)
                    }
                    pipelineItinIdForOnSave = pipelineItinId
                    for (const day of cleanedDayPlans) await addItineraryDay(pipelineItinId, day)
                    for (const flight of flightSegments) await addItineraryFlight(pipelineItinId, flight)
                    for (let hi = 0; hi < selectedHotels.length; hi++) { const hotel = selectedHotels[hi]; await addItineraryHotel(pipelineItinId, { ...hotel, sortOrder: hi, numberOfRooms: hotel.numberOfRooms || 1, numberOfExtraBeds: hotel.numberOfExtraBeds || 0 }) }
                    for (let ti = 0; ti < transfers.length; ti++) await addItineraryTransfer(pipelineItinId, { ...transfers[ti], sortOrder: ti })
                    for (const act of selectedActivities) await addItineraryActivity(pipelineItinId, act)
                    await addItineraryPricing(pipelineItinId, { totalPrice, perPersonPrice, margin, nights, adults, children, plans, manualHotelCost, manualTransferCost, manualActivityCost })
                }

            } else {
                const itineraryData = {
                    ...baseData,
                    customerName, customerPhone, customerEmail,
                    consultantName, consultantPhone,
                }
                console.log("SAVE ITINERARY PAYLOAD:", itineraryData);

                // Reuse the auto-created draft (if any) so we update it in place — this is what
                // flips its "Not Completed" tag off once the itinerary is finished.
                const targetId = (editId as string) || draftId
                if (targetId) {
                    await updateItinerary(targetId, itineraryData)
                    await clearItinerarySubcollections(targetId)
                    itinId = targetId
                } else {
                    itinId = await createItinerary(itineraryData)
                }

                // Customer record creation is now handled centrally inside createItinerary
                // to avoid duplicates and ensure correct metadata (createdBy, etc.)

                for (const day of cleanedDayPlans) await addItineraryDay(itinId, day)
                for (const flight of flightSegments) await addItineraryFlight(itinId, flight)
                for (let hi = 0; hi < selectedHotels.length; hi++) { const hotel = selectedHotels[hi]; await addItineraryHotel(itinId, { ...hotel, sortOrder: hi, numberOfRooms: hotel.numberOfRooms || 1, numberOfExtraBeds: hotel.numberOfExtraBeds || 0 }) }
                for (let ti = 0; ti < transfers.length; ti++) await addItineraryTransfer(itinId, { ...transfers[ti], sortOrder: ti })
                for (const act of selectedActivities) await addItineraryActivity(itinId, act)
                await addItineraryPricing(itinId, { totalPrice, perPersonPrice, margin, nights, adults, children, plans, manualHotelCost, manualTransferCost, manualActivityCost })
            }

            if (onSave) {
                onSave(pipelineItinIdForOnSave || itinId)
            } else {
                router.push(`/sales/itinerary/${itinId}`)
            }

        } catch (err: any) {
            console.error("SAVE ERROR:", err)
            toast({
                title: "Save Failed",
                description: "Error saving: " + (err.message || JSON.stringify(err)),
                variant: "destructive"
            })
        } finally {
            setSaving(false)
        }
    }

    const inputStyle: React.CSSProperties = { background: '#FFFFFF', color: '#1a1a1a', border: '1px solid #e2e8f0', outline: 'none', borderRadius: '12px', fontSize: '14px', transition: 'border-color 0.2s, box-shadow 0.2s' }
    const selectStyle: React.CSSProperties = { ...inputStyle, color: '#000000', backgroundColor: '#FFFFFF' }
    const inputClass = "w-full px-4 py-3 rounded-xl font-sans text-sm focus:border-emerald-400"
    const labelClass = "font-sans text-xs sm:text-sm font-medium mb-1.5 block"
    const labelStyle: React.CSSProperties = { color: '#052210' }

    const stepProgress = Math.round((step / (STEPS.length - 1)) * 100)
    const isAnyDropdownOpen = !!(openTierLocDropdown || openTierHotelDropdown || openTierRoomDropdown)

    return (
        <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto pb-24 sm:pb-8 px-2 sm:px-0">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-serif text-2xl sm:text-3xl tracking-wide" style={{ color: '#052210' }}>
                        {editId ? (mode === "package" ? "Edit Package Template" : "Edit Itinerary") : (mode === "package" ? "New Package Template" : "New Itinerary")}
                    </h1>
                    <p className="font-sans text-xs sm:text-sm mt-1" style={{ color: '#6b7280' }}>
                        {editId ? `Update the ${mode === "package" ? "package template" : "itinerary"} details below` : `Create a new travel ${mode === "package" ? "package template" : "itinerary"} step by step`}
                    </p>
                </div>
                {nights > 0 && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-sans text-xs font-bold tracking-wider" style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                        <Calendar className="w-3.5 h-3.5" /> {nights}N / {totalDays}D
                    </span>
                )}
            </div>

            {/* Mobile step indicator */}
            <div className="flex sm:hidden items-center justify-between p-3 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="p-2 rounded-xl disabled:opacity-20 transition-colors" style={{ color: '#059669' }}>
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: '#059669' }}>
                        {step + 1}
                    </div>
                    <div>
                        <p className="font-sans text-sm font-semibold" style={{ color: '#052210' }}>{STEPS[step].label}</p>
                        <p className="font-sans text-[10px]" style={{ color: '#9ca3af' }}>Step {step + 1} of {STEPS.length}</p>
                    </div>
                </div>
                <button onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))} disabled={step === STEPS.length - 1} className="p-2 rounded-xl disabled:opacity-20 transition-colors" style={{ color: '#059669' }}>
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>

            {/* Desktop step indicator */}
            <div className="hidden sm:block p-4 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div className="flex items-center justify-between relative">
                    {/* Progress line background */}
                    <div className="absolute top-4 left-6 right-6 h-0.5" style={{ background: '#e5e7eb' }} />
                    <div className="absolute top-4 left-6 h-0.5 transition-all duration-500" style={{ background: '#059669', width: `calc(${stepProgress}% - 48px)` }} />

                    {STEPS.map((s, i) => (
                        <button key={i} onClick={() => setStep(i)} className="relative flex flex-col items-center gap-1.5 z-10 group">
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 text-xs font-bold"
                                style={{
                                    background: i <= step ? '#059669' : '#FFFFFF',
                                    color: i <= step ? '#FFFFFF' : '#9ca3af',
                                    border: i <= step ? '2px solid #059669' : '2px solid #d1d5db',
                                    boxShadow: i === step ? '0 0 0 4px rgba(5,150,105,0.15)' : 'none',
                                }}
                            >
                                {i < step ? <Check className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
                            </div>
                            <span className="font-sans text-[10px] font-semibold tracking-wider whitespace-nowrap" style={{ color: i === step ? '#059669' : i < step ? '#052210' : '#9ca3af' }}>
                                {s.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Step content */}
            <div className="rounded-2xl p-4 sm:p-6 md:p-8" style={{ background: '#FFFFFF', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>

                {/* STEP 0: Customer & Trip */}
                {step === 0 && (
                    <div className="space-y-6">
                        {/* Customer / Package Info Section */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#ecfdf5' }}>
                                    {mode === "package" ? <PackageSearch className="w-3.5 h-3.5" style={{ color: '#059669' }} /> : <User className="w-3.5 h-3.5" style={{ color: '#059669' }} />}
                                </div>
                                <h2 className="font-serif text-lg sm:text-xl tracking-wide" style={{ color: '#052210' }}>
                                    {mode === "package" ? "Package Information" : "Customer Information"}
                                </h2>
                            </div>

                            {mode === "package" && (
                                <div className="mb-4 p-4 rounded-xl flex items-start gap-3" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                                    <div className="flex-1">
                                        <p className="font-sans text-sm font-semibold" style={{ color: '#92400e' }}>Template Mode Active</p>
                                        <p className="font-sans text-xs mt-1" style={{ color: '#b45309' }}>
                                            Packages built here act as <strong>reusable templates</strong> and will not appear in the active sales pipeline or customer page. To generate a real itinerary from this template, navigate to <strong>Ready-Made Itineraries</strong> after saving.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className={labelClass} style={labelStyle}>Select Existing Customer (Optional)</label>
                                    <select 
                                        className={inputClass} 
                                        style={selectStyle} 
                                        onChange={e => {
                                            const c = customers.find((x: any) => x.id === e.target.value)
                                            if (c) {
                                                setCustomerName(c.name || "")
                                                setCustomerPhone(c.phone || "")
                                                const split = splitPhoneNumber(c.phone || "")
                                                setCustomerCountryCode(split.code)
                                                setCustomerPhoneNum(split.num)
                                                setCustomerEmail(c.email || "")
                                                setErrors(prev => ({ ...prev, customerName: "", customerPhone: "", customerEmail: "" }))
                                            }
                                        }}
                                    >
                                        <option value="">-- Choose from existing customers or type below --</option>
                                        {customers.map((c: any) => (
                                            <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                                <div id="wizard-field-customerName">
                                    <label className={labelClass} style={labelStyle}>{mode === "package" ? "Package Name / Customer Name" : "Customer Name"} <span className="text-red-500">*</span></label>
                                    <input 
                                        className={inputClass} 
                                        style={{ ...inputStyle, borderColor: errors.customerName ? '#ef4444' : '#e2e8f0' }} 
                                        value={customerName} 
                                        onBlur={() => setErrors(prev => ({ ...prev, customerName: validateName(customerName) }))}
                                        onChange={e => {
                                            setCustomerName(e.target.value);
                                            if (errors.customerName) setErrors(prev => ({ ...prev, customerName: validateName(e.target.value) }));
                                        }} 
                                        placeholder={mode === "package" ? "Enter package name (e.g. Kerala Deluxe)" : "Enter customer name (e.g. Mr. Wasim)"} 
                                    />
                                    {errors.customerName && <p className="text-[10px] text-red-500 mt-1 ml-1 font-semibold">{errors.customerName}</p>}
                                </div>
                                <div id="wizard-field-phone">
                                    <label className={labelClass} style={labelStyle}>Phone <span className="text-red-500">*</span></label>
                                    <div className="flex gap-2">
                                         <div className="relative w-[135px] flex-shrink-0">
                                             <input 
                                                 type="text"
                                                 className="w-full px-3 py-3 rounded-xl font-sans text-sm focus:border-emerald-400 outline-none" 
                                                 style={{ ...inputStyle, borderColor: errors.customerPhone ? '#ef4444' : '#e2e8f0' }} 
                                                 value={countrySearch}
                                                 placeholder="+91"
                                                 onFocus={() => setCountryDropdownOpen(true)}
                                                 onBlur={() => setTimeout(() => setCountryDropdownOpen(false), 200)}
                                                 onChange={e => {
                                                     const val = e.target.value;
                                                     setCountrySearch(val);
                                                     setCustomerCountryCode(val);
                                                     const full = val + customerPhoneNum;
                                                     setCustomerPhone(full);
                                                     if (errors.customerPhone) setErrors(prev => ({ ...prev, customerPhone: validatePhone(customerPhoneNum) }));
                                                 }}
                                             />
                                             <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                                             {countryDropdownOpen && (
                                                 <div className="absolute z-[100] w-[260px] left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto py-2">
                                                     {(() => {
                                                          const query = countrySearch.toLowerCase().trim();
                                                          const filtered = COUNTRY_CODES.filter(c => 
                                                              c.country.toLowerCase().includes(query) || 
                                                              c.code.includes(query)
                                                          );
                                                          return filtered.length > 0 ? (
                                                              filtered.map(c => (
                                                                  <div
                                                                      key={c.country + c.code}
                                                                      className="px-4 py-2 hover:bg-emerald-50 text-xs font-sans cursor-pointer transition-colors flex items-center justify-between"
                                                                      onMouseDown={() => {
                                                                          setCustomerCountryCode(c.code);
                                                                          setCountrySearch(c.code);
                                                                          const full = c.code + customerPhoneNum;
                                                                          setCustomerPhone(full);
                                                                          setCountryDropdownOpen(false);
                                                                      }}
                                                                  >
                                                                      <span>{c.flag} {c.country}</span>
                                                                      <span className="font-bold text-gray-400">{c.code}</span>
                                                                  </div>
                                                              ))
                                                          ) : (
                                                              <div className="px-4 py-2 text-xs text-gray-400 italic">No matches. Type custom code.</div>
                                                          );
                                                     })()}
                                                 </div>
                                             )}
                                         </div>
                                         <input 
                                            type="tel"
                                            className="flex-1 px-4 py-3 rounded-xl font-sans text-sm focus:border-emerald-400" 
                                            style={{ ...inputStyle, borderColor: errors.customerPhone ? '#ef4444' : '#e2e8f0' }} 
                                            value={customerPhoneNum} 
                                            placeholder="Enter phone number"
                                            onBlur={() => setErrors(prev => ({ ...prev, customerPhone: validatePhone(customerPhoneNum) }))}
                                            onChange={e => {
                                                const val = e.target.value.replace(/\D/g, '').slice(0, 15); // Only digits, max 15
                                                setCustomerPhoneNum(val);
                                                const full = customerCountryCode + val;
                                                setCustomerPhone(full);
                                                if (errors.customerPhone) setErrors(prev => ({ ...prev, customerPhone: validatePhone(val) }));
                                            }} 
                                        />
                                    </div>
                                    {errors.customerPhone && <p className="text-[10px] text-red-500 mt-1 ml-1 font-semibold">{errors.customerPhone}</p>}
                                </div>
                                <div className="sm:col-span-2" id="wizard-field-email">
                                    <label className={labelClass} style={labelStyle}>Email (Optional)</label>
                                    <input 
                                        className={inputClass} 
                                        style={{ ...inputStyle, borderColor: errors.customerEmail ? '#ef4444' : '#e2e8f0' }} 
                                        value={customerEmail} 
                                        onBlur={() => setErrors(prev => ({ ...prev, customerEmail: validateEmail(customerEmail) }))}
                                        onChange={e => {
                                            const val = e.target.value.toLowerCase().trim();
                                            setCustomerEmail(val);
                                            if (errors.customerEmail) setErrors(prev => ({ ...prev, customerEmail: validateEmail(val) }));
                                        }} 
                                        placeholder="Enter email address (e.g. customer@email.com)" 
                                    />
                                    {errors.customerEmail && <p className="text-[10px] text-red-500 mt-1 ml-1 font-semibold">{errors.customerEmail}</p>}
                                </div>
                            </div>
                        </div>

                        <div className="h-px" style={{ background: '#f3f4f6' }} />

                        {/* Trip Details Section */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#ecfdf5' }}><MapPin className="w-3.5 h-3.5" style={{ color: '#059669' }} /></div>
                                <h2 className="font-serif text-lg sm:text-xl tracking-wide" style={{ color: '#052210' }}>Trip Details</h2>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div id="wizard-field-destination">
                                    <label className={labelClass} style={labelStyle}>Destination <span className="text-red-500">*</span></label>
                                    <select className={inputClass} style={{ ...selectStyle, borderColor: errors.destination ? '#ef4444' : '#e2e8f0' }} value={destinationId} onChange={e => {
                                        setDestinationId(e.target.value)
                                        const d = destinations.find((d: any) => d.id === e.target.value)
                                        setDestinationName(d?.name || "")
                                        if (errors.destination && e.target.value) setErrors(prev => ({ ...prev, destination: "" }))
                                    }}>
                                        <option style={{ color: '#000000', backgroundColor: '#FFFFFF' }} value="">Select destination</option>
                                        {destinations.map((d: any) => <option style={{ color: '#000000', backgroundColor: '#FFFFFF' }} key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                    {errors.destination && <p className="text-[10px] text-red-500 mt-1 ml-1 font-semibold">{errors.destination}</p>}
                                </div>
                                <div className="sm:col-span-2" id="wizard-field-dates">
                                    <label className={labelClass} style={labelStyle}>Travel Dates <span className="text-red-500">*</span></label>
                                    {errors.dates && <p className="text-[10px] text-red-500 mb-1 ml-1 font-semibold">{errors.dates}</p>}
                                    <div className="rounded-xl p-4" style={{ background: errors.dates ? '#fef2f2' : '#f9fafb', border: errors.dates ? '1px solid #ef4444' : '1px solid #e5e7eb' }}>
                                        {/* Month nav */}
                                        <div className="flex items-center justify-between mb-3">
                                            <button type="button" onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                                                <ChevronLeft className="w-4 h-4" style={{ color: '#6b7280' }} />
                                            </button>
                                            <span className="font-sans text-sm font-semibold" style={{ color: '#052210' }}>{calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                                            <button type="button" onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                                                <ChevronRight className="w-4 h-4" style={{ color: '#6b7280' }} />
                                            </button>
                                        </div>
                                        {/* Day headers */}
                                        <div className="grid grid-cols-7 gap-0 mb-1">
                                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                                                <div key={d} className="text-center font-sans text-[10px] font-semibold py-1" style={{ color: '#9ca3af' }}>{d}</div>
                                            ))}
                                        </div>
                                        {/* Day grid */}
                                        {(() => {
                                            const cy = calMonth.getFullYear(), cm = calMonth.getMonth()
                                            const firstDay = new Date(cy, cm, 1).getDay()
                                            const dim = new Date(cy, cm + 1, 0).getDate()
                                            const toStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                                            const todayStr = toStr(new Date())
                                            return (
                                                <div className="grid grid-cols-7 gap-0">
                                                    {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                                                    {Array.from({ length: dim }).map((_, i) => {
                                                        const day = i + 1
                                                        const ds = toStr(new Date(cy, cm, day))
                                                        const s = startDate === ds
                                                        const e = endDate === ds
                                                        const inR = !!startDate && !!endDate && ds > startDate && ds < endDate
                                                        const isPast = ds < todayStr
                                                        return (
                                                            <button type="button" key={day} disabled={isPast} onClick={() => {
                                                                if (!pickingEnd || !startDate) { setStartDate(ds); setEndDate(''); setPickingEnd(true) }
                                                                else if (ds < startDate) { setStartDate(ds); setEndDate(''); }
                                                                else { setEndDate(ds); setPickingEnd(false); if (errors.dates) setErrors(prev => ({ ...prev, dates: "" })) }
                                                            }} className="relative h-9 flex items-center justify-center font-sans text-xs transition-all" style={{
                                                                background: s || e ? '#059669' : inR ? '#ecfdf5' : 'transparent',
                                                                color: s || e ? '#fff' : isPast ? '#d1d5db' : inR ? '#059669' : '#374151',
                                                                borderRadius: s ? '9999px 0 0 9999px' : e ? '0 9999px 9999px 0' : inR ? '0' : '9999px',
                                                                fontWeight: s || e ? 700 : 400, cursor: isPast ? 'default' : 'pointer',
                                                            }}>{day}</button>
                                                        )
                                                    })}
                                                </div>
                                            )
                                        })()}
                                        {/* Selection display */}
                                        <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: '1px solid #e5e7eb' }}>
                                            <div className="flex-1 text-center">
                                                <p className="font-sans text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9ca3af' }}>Start</p>
                                                <p className="font-sans text-sm font-bold mt-0.5" style={{ color: startDate ? '#052210' : '#d1d5db' }}>
                                                    {startDate ? new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                                </p>
                                            </div>
                                            <div className="w-6 h-px" style={{ background: '#d1d5db' }} />
                                            <div className="flex-1 text-center">
                                                <p className="font-sans text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9ca3af' }}>End</p>
                                                <p className="font-sans text-sm font-bold mt-0.5" style={{ color: endDate ? '#052210' : '#d1d5db' }}>
                                                    {endDate ? new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : pickingEnd ? 'Select...' : '—'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div id="wizard-field-adults"><label className={labelClass} style={labelStyle}>Adults <span className="text-red-500">*</span></label><input type="number" className={`${inputClass} pr-10`} style={{ ...inputStyle, borderColor: errors.adults ? '#ef4444' : '#e2e8f0' }} placeholder="Enter number of adults" value={adults === 0 ? "" : adults} onFocus={e => { if (adults === 0) e.target.value = "" }} onChange={e => { let val = e.target.value.replace(/^0+/, ''); if (val === "") setAdults(0); else setAdults(Math.max(1, parseInt(val) || 0)); if (errors.adults && parseInt(val) >= 1) setErrors(prev => ({ ...prev, adults: "" })); }} onBlur={e => { if (e.target.value === "") setAdults(1); }} min={1} />{errors.adults && <p className="text-[10px] text-red-500 mt-1 ml-1 font-semibold">{errors.adults}</p>}</div>
                                <div><label className={labelClass} style={labelStyle}>Children (Optional)</label><input type="number" className={`${inputClass} pr-10`} style={inputStyle} placeholder="Enter number of children" value={children === 0 ? "" : children} onFocus={e => { if (children === 0) e.target.value = "" }} onChange={e => { let val = e.target.value.replace(/^0+/, ''); if (val === "") setChildren(0); else setChildren(Math.max(0, parseInt(val) || 0)); }} onBlur={e => { if (e.target.value === "") setChildren(0); }} min={0} /></div>
                                {children > 0 && Array.from({ length: children }).map((_, i) => {
                                    const ageYears = parseAgeYears(childAges[i] || "")
                                    const isInfant = ageYears !== null && ageYears < 5
                                    return (
                                        <div key={i} className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className={labelClass} style={labelStyle}>Child {i + 1} Age</label>
                                                <input className={inputClass} style={inputStyle} value={childAges[i] || ""} onChange={e => { const newAges = [...childAges]; newAges[i] = e.target.value; setChildAges(newAges) }} placeholder="e.g. 6 Yrs" />
                                            </div>
                                            <div>
                                                <label className={labelClass} style={labelStyle}>Child {i + 1} Bed</label>
                                                {isInfant ? (
                                                    <div className={inputClass} style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: '#059669', fontWeight: 600 }}>Infant · Complimentary</div>
                                                ) : (
                                                    <select className={inputClass} style={inputStyle} value={childBedTypes[i] || "with"} onChange={e => { const next = [...childBedTypes]; next[i] = e.target.value; setChildBedTypes(next) }}>
                                                        <option value="with">With Bed</option>
                                                        <option value="without">Without Bed</option>
                                                    </select>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                                <div><label className={labelClass} style={labelStyle}>Consultant Name *</label><input id="wizard-field-consultantName" className={inputClass} style={inputStyle} placeholder="Consultant name" value={consultantName} onChange={e => setConsultantName(e.target.value)} /></div>
                                <div><label className={labelClass} style={labelStyle}>Consultant Phone *</label><input id="wizard-field-consultantPhone" className={inputClass} style={inputStyle} placeholder="Consultant phone number" value={consultantPhone} onChange={e => setConsultantPhone(e.target.value)} /></div>
                            </div>
                        </div>

                        {nights > 0 && (
                            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                                <Calendar className="w-4 h-4" style={{ color: '#059669' }} />
                                <span className="font-sans text-sm font-semibold" style={{ color: '#059669' }}>{nights} Nights / {totalDays} Days</span>
                                {destinationName && <span className="font-sans text-sm" style={{ color: '#047857' }}>· {destinationName}</span>}
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 1: Flights (Optional) */}
                {step === 1 && (
                    <div className="space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#ecfdf5' }}><Plane className="w-3.5 h-3.5" style={{ color: '#059669' }} /></div>
                                <div>
                                    <h2 className="font-serif text-lg sm:text-xl tracking-wide" style={{ color: '#052210' }}>Flights</h2>
                                    <p className="font-sans text-[11px]" style={{ color: '#9ca3af' }}>Optional — won&apos;t show in PDF if skipped</p>
                                </div>
                            </div>
                            <label className="cursor-pointer relative overflow-hidden inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-sans text-xs font-semibold tracking-wider uppercase transition-all hover:bg-emerald-100" style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                                {isExtractingFlight ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#059669' }} /> : <Sparkles className="w-4 h-4" style={{ color: "#059669" }} />}
                                {isExtractingFlight ? "Running OCR..." : "Auto-Fill OCR"}
                                <input type="file" accept="image/*" onChange={handleFlightScreenshot} className="absolute inset-0 opacity-0 cursor-pointer" disabled={isExtractingFlight} />
                            </label>
                        </div>
                        <p className="font-sans text-xs px-1" style={{ color: '#6b7280' }}>Upload a screenshot, <strong>Paste (Ctrl+V)</strong> an image, or add manually below.</p>

                        {flightSegments.map((seg, idx) => (
                            <div key={idx} className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-xl" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                                <button onClick={() => setFlightSegments(flightSegments.filter((_, i) => i !== idx))} className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                                    <Trash2 className="w-4 h-4" style={{ color: '#ef4444' }} />
                                </button>

                                <div>
                                    <label className={labelClass} style={labelStyle}>Segment Type *</label>
                                    <select className={inputClass} style={selectStyle} value={seg.type} onChange={e => { const s = [...flightSegments]; s[idx].type = e.target.value; setFlightSegments(s) }}>
                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="Onward">Onward</option>
                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="Return">Return</option>
                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="Internal">Internal</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass} style={labelStyle}>Airline (Optional)</label>
                                    <input className={inputClass} style={inputStyle} placeholder="Enter airline name" value={seg.airline} onChange={e => { const s = [...flightSegments]; s[idx].airline = e.target.value; setFlightSegments(s) }} />
                                </div>
                                <div>
                                    <label className={labelClass} style={labelStyle}>Flight Number (Optional)</label>
                                    <input className={inputClass} style={inputStyle} placeholder="Enter flight number" value={seg.flightNo} onChange={e => { const s = [...flightSegments]; s[idx].flightNo = e.target.value; setFlightSegments(s) }} />
                                </div>
                                <div>
                                    <label className={labelClass} style={labelStyle}>Stops *</label>
                                    <select className={inputClass} style={selectStyle} value={seg.flightType || "Direct"} onChange={e => { const s = [...flightSegments]; s[idx].flightType = e.target.value; setFlightSegments(s) }}>
                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="Direct">Direct</option>
                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="1 Stop">1 Stop</option>
                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="2+ Stops">2+ Stops</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass} style={labelStyle}>From *</label>
                                    <input className={inputClass} style={inputStyle} placeholder="Enter origin (e.g. TRV)" value={seg.fromCode} onChange={e => { const s = [...flightSegments]; s[idx].fromCode = e.target.value; setFlightSegments(s) }} />
                                </div>
                                <div>
                                    <label className={labelClass} style={labelStyle}>Departure Time *</label>
                                    <input className={inputClass} style={inputStyle} placeholder="Select departure date/time" value={seg.departure} onChange={e => { const s = [...flightSegments]; s[idx].departure = e.target.value; setFlightSegments(s) }} />
                                </div>
                                <div>
                                    <label className={labelClass} style={labelStyle}>To *</label>
                                    <input className={inputClass} style={inputStyle} placeholder="Enter destination (e.g. KUL)" value={seg.toCode} onChange={e => { const s = [...flightSegments]; s[idx].toCode = e.target.value; setFlightSegments(s) }} />
                                </div>
                                <div>
                                    <label className={labelClass} style={labelStyle}>Arrival Time *</label>
                                    <input className={inputClass} style={inputStyle} placeholder="Select arrival date/time" value={seg.arrival} onChange={e => { const s = [...flightSegments]; s[idx].arrival = e.target.value; setFlightSegments(s) }} />
                                </div>
                                <div>
                                    <label className={labelClass} style={labelStyle}>Duration (Optional)</label>
                                    <input className={inputClass} style={inputStyle} placeholder="Enter flight duration (e.g. 3h 25m)" value={seg.duration} onChange={e => { const s = [...flightSegments]; s[idx].duration = e.target.value; setFlightSegments(s) }} />
                                </div>
                                <div>
                                    <label className={labelClass} style={labelStyle}>Price (Optional)</label>
                                    <input type="number" className={`${inputClass} pr-10`} style={inputStyle} placeholder="Enter price (₹)" value={seg.price === 0 ? "" : seg.price} onFocus={e => { if (seg.price === 0) e.target.value = "" }} onChange={e => { let val = e.target.value.replace(/^0+/, ''); const s = [...flightSegments]; if (val === "") s[idx].price = 0; else s[idx].price = Math.max(0, parseInt(val) || 0); setFlightSegments(s); }} onBlur={e => { if (e.target.value === "") { const s = [...flightSegments]; s[idx].price = 0; setFlightSegments(s); } }} />
                                </div>
                                {seg.flightType === "Connecting" && (
                                    <div className="sm:col-span-2">
                                        <label className={labelClass} style={labelStyle}>Layover Details (Optional)</label>
                                        <input className={inputClass} style={inputStyle} placeholder="Enter layover details" value={seg.layoverDetails || ""} onChange={e => { const s = [...flightSegments]; s[idx].layoverDetails = e.target.value; setFlightSegments(s) }} />
                                    </div>
                                )}
                            </div>
                        ))}

                        {flightSegments.length === 0 && (
                            <div className="text-center py-10 rounded-xl" style={{ background: '#f9fafb', border: '2px dashed #d1d5db' }}>
                                <Plane className="w-10 h-10 mx-auto mb-3" style={{ color: '#d1d5db' }} />
                                <p className="font-sans text-sm" style={{ color: '#9ca3af' }}>No flights added yet</p>
                            </div>
                        )}

                        <button onClick={() => setFlightSegments([...flightSegments, { type: "Onward", airline: "", flightNo: "", fromCode: "", departure: "", toCode: "", arrival: "", duration: "", flightType: "Direct", layoverDetails: "", price: 0 }])} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-sans text-xs font-semibold tracking-wider uppercase transition-all hover:bg-emerald-50" style={{ color: '#059669', border: '1px solid #a7f3d0' }}>
                            <Plus className="w-3.5 h-3.5" /> Add Flight
                        </button>
                    </div>
                )}

                {/* STEP 2: Hotels & Tiers Builder */}
                {step === 2 && (
                    <div className="space-y-8">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                                    <Hotel className="w-5 h-5" style={{ color: '#059669' }} />
                                </div>
                                <div>
                                    <h2 className="font-serif text-xl sm:text-2xl tracking-wide" style={{ color: '#052210' }}>Select Hotels & Tiers</h2>
                                    <p className="font-sans text-xs sm:text-sm" style={{ color: '#6b7280' }}>Build up to 3 pricing options to offer your clients different budget options.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    if (tierPlans.length >= 3) {
                                        showDialog({
                                            title: "Warning",
                                            message: "Maximum 3 pricing options allowed.",
                                            type: "warning"
                                        });
                                        return;
                                    }
                                    setTierPlans([...tierPlans, { 
                                        name: TIER_NAMES[tierPlans.length] || "CUSTOM", 
                                        stops: [{ location: "", hotelId: "", hotelName: "", nights: 1, mealPlan: "CP (Breakfast)", roomType: "", ratePerNight: 0, numberOfRooms: 1, numberOfExtraBeds: 0 }]
                                    }]);
                                }}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl font-sans text-xs font-bold tracking-wider uppercase transition-all shadow-sm hover:translate-y-[-1px] active:translate-y-[0px]"
                                style={{ background: '#052210', color: '#FFFFFF' }}
                            >
                                <Plus className="w-4 h-4" /> Add Pricing Option
                            </button>
                        </div>

                        <div className="space-y-6">
                             {tierPlans.map((plan, planIdx) => (
                                <div key={planIdx} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-visible group transition-all" style={{ marginBottom: '24px' }}>
                                    {/* Plan Header */}
                                    <div className="px-8 py-6 bg-gray-50/50 border-b border-gray-100 rounded-t-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-6">
                                            <div className="flex items-center gap-4">
                                                {/* PLAN BADGE */}
                                                <div className="bg-[#052210] px-4 py-2 rounded-xl shadow-sm flex items-center justify-center">
                                                    <span className="font-sans text-sm font-black text-white uppercase tracking-wider">
                                                        Option {planIdx + 1}
                                                    </span>
                                                </div>

                                            </div>
                                        </div>
                                        {tierPlans.length > 1 && (
                                            <button 
                                                onClick={() => setTierPlans(tierPlans.filter((_, i) => i !== planIdx))}
                                                className="flex items-center gap-2 px-4 py-2 rounded-xl font-sans text-xs font-bold text-red-500 bg-white border border-red-100 hover:bg-red-500 hover:text-white transition-all uppercase tracking-widest shadow-sm"
                                            >
                                                <Trash2 className="w-4 h-4" /> Remove
                                            </button>
                                        )}
                                    </div>

                                    {/* Stops Builder */}
                                    <div className="p-8 space-y-10">
                                        {plan.stops.map((stop: any, stopIdx: number) => (
                                            <div key={stopIdx} className="relative group/stop animate-in fade-in slide-in-from-left-4 duration-300">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <span className="font-sans text-[11px] font-black uppercase tracking-[0.25em] text-gray-400">Hotel {stopIdx + 1}</span>
                                                    <div className="h-px flex-1 bg-gray-100" />
                                                    {plan.stops.length > 1 && (
                                                        <button 
                                                            onClick={() => {
                                                                const newPlans = [...tierPlans];
                                                                newPlans[planIdx].stops = newPlans[planIdx].stops.filter((_: any, i: number) => i !== stopIdx);
                                                                setTierPlans(newPlans);
                                                            }}
                                                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 p-6 bg-gray-50/30 rounded-2xl border border-gray-100 transition-all group-hover/stop:bg-white group-hover/stop:border-emerald-100 group-hover/stop:shadow-md relative z-[1]">
                                                    {/* Hotel Category — per hotel */}
                                                    <div className="sm:col-span-4 space-y-1.5">
                                                        <label className="font-sans text-xs sm:text-sm font-medium mb-1.5 block" style={labelStyle}>Hotel Category</label>
                                                        <input
                                                            list={`hotel-cat-${planIdx}-${stopIdx}`}
                                                            value={stop.category || ""}
                                                            placeholder="e.g. 3 Star, Deluxe…"
                                                            onChange={(e) => {
                                                                const newPlans = [...tierPlans];
                                                                newPlans[planIdx].stops[stopIdx].category = e.target.value;
                                                                setTierPlans(newPlans);
                                                            }}
                                                            className={inputClass}
                                                            style={inputStyle}
                                                        />
                                                        <datalist id={`hotel-cat-${planIdx}-${stopIdx}`}>
                                                            {TIER_NAMES.map(t => <option key={t} value={t} />)}
                                                        </datalist>
                                                    </div>
                                                    {/* spacer to push the location row onto its own line */}
                                                    <div className="hidden sm:block sm:col-span-8" />
                                                    {/* Location */}
                                                    <div className="sm:col-span-3 space-y-1.5 relative">
                                                        <label className="font-sans text-xs sm:text-sm font-medium mb-1.5 flex items-center gap-1" style={labelStyle}>
                                                            <MapPin className="w-3.5 h-3.5" /> Location *
                                                        </label>
                                                        <div className="relative group/dropdown">
                                                            <div className="relative">
                                                                <input 
                                                                    className={`${inputClass} pr-10`} 
                                                                    style={inputStyle} 
                                                                    placeholder="Select or type location"
                                                                    value={openTierLocDropdown?.planIdx === planIdx && openTierLocDropdown?.stopIdx === stopIdx ? localLocSearch : (stop.location || "")}
                                                                    onFocus={() => {
                                                                        setOpenTierLocDropdown({ planIdx, stopIdx });
                                                                        setLocalLocSearch(stop.location || "");
                                                                    }}
                                                                    onBlur={() => setTimeout(() => setOpenTierLocDropdown(null), 200)}
                                                                    onChange={(e) => {
                                                                        setLocalLocSearch(e.target.value);
                                                                        const newPlans = [...tierPlans];
                                                                        newPlans[planIdx].stops[stopIdx].location = e.target.value;
                                                                        setTierPlans(newPlans);
                                                                    }}
                                                                />
                                                                <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600 transition-transform ${openTierLocDropdown?.planIdx === planIdx && openTierLocDropdown?.stopIdx === stopIdx ? 'rotate-180' : ''}`} />
                                                            </div>
                                                            {openTierLocDropdown?.planIdx === planIdx && openTierLocDropdown?.stopIdx === stopIdx && (
                                                                <div className="absolute z-[50] w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-auto py-2 animate-in fade-in slide-in-from-top-2">
                                                                    {localLocSearch && !(destinations?.find((d: any) => d.id === destinationId)?.subDestinations || []).some(l => l.toLowerCase() === localLocSearch.toLowerCase()) && (
                                                                        <div 
                                                                            className="px-4 py-3 hover:bg-emerald-50 text-xs font-bold text-emerald-600 italic cursor-pointer flex items-center justify-between border-b border-gray-50"
                                                                            onMouseDown={(e) => {
                                                                                e.preventDefault();
                                                                                const newPlans = [...tierPlans];
                                                                                newPlans[planIdx].stops[stopIdx].location = localLocSearch;
                                                                                setTierPlans(newPlans);
                                                                                setOpenTierLocDropdown(null);
                                                                            }}
                                                                        >
                                                                            ➕ Add "{localLocSearch}"
                                                                            <Plus className="w-3.5 h-3.5" />
                                                                        </div>
                                                                    )}
                                                                    {(destinations?.find((d: any) => d.id === destinationId)?.subDestinations || [])
                                                                        .slice()
                                                                        .sort((a, b) => {
                                                                            const s = localLocSearch.toLowerCase().trim();
                                                                            if (!s) return a.localeCompare(b);
                                                                            const aMatch = a.toLowerCase().includes(s);
                                                                            const bMatch = b.toLowerCase().includes(s);
                                                                            if (aMatch && !bMatch) return -1;
                                                                            if (!aMatch && bMatch) return 1;
                                                                            return a.localeCompare(b);
                                                                        })
                                                                        .map((loc: string) => (
                                                                        <div 
                                                                            key={loc} 
                                                                            className="px-4 py-3 hover:bg-emerald-50 text-sm font-sans font-medium cursor-pointer transition-colors flex items-center justify-between group"
                                                                            onMouseDown={(e) => {
                                                                                e.preventDefault();
                                                                                const newPlans = [...tierPlans];
                                                                                newPlans[planIdx].stops[stopIdx].location = loc;
                                                                                setLocalLocSearch(loc);
                                                                                
                                                                                // Reset hotel and pricing fields when location changes to prevent auto-selection
                                                                                newPlans[planIdx].stops[stopIdx].hotelId = "";
                                                                                newPlans[planIdx].stops[stopIdx].hotelName = "";
                                                                                newPlans[planIdx].stops[stopIdx].ratePerNight = 0;
                                                                                newPlans[planIdx].stops[stopIdx].roomType = "";
                                                                                newPlans[planIdx].stops[stopIdx].starRating = 3;

                                                                                setTierPlans(newPlans);
                                                                                setOpenTierLocDropdown(null);
                                                                            }}
                                                                        >
                                                                            <span>{loc}</span>
                                                                            {stop.location === loc && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                                                                        </div>
                                                                    ))}
                                                                    {(!(destinations?.find((d: any) => d.id === destinationId)?.subDestinations || []).length) && (
                                                                        <div className="px-4 py-3 text-xs text-gray-400 italic">No locations found. Add them in Destinations.</div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Hotel */}
                                                    <div className="sm:col-span-4 space-y-1.5 relative">
                                                        <label className="font-sans text-xs sm:text-sm font-medium mb-1.5 flex items-center gap-1" style={labelStyle}>
                                                            <Hotel className="w-3.5 h-3.5" /> Hotel *
                                                        </label>
                                                        <div className="relative group/dropdown">
                                                            <div className="relative">
                                                                <input 
                                                                    className={`${inputClass} pr-10`} 
                                                                    style={inputStyle} 
                                                                    placeholder="Select or type hotel name"
                                                                    value={openTierHotelDropdown?.planIdx === planIdx && openTierHotelDropdown?.stopIdx === stopIdx ? localHotelSearch : (stop.hotelName || "")}
                                                                    onFocus={() => {
                                                                        setOpenTierHotelDropdown({ planIdx, stopIdx });
                                                                        setLocalHotelSearch(stop.hotelName || "");
                                                                    }}
                                                                    onBlur={() => setTimeout(() => setOpenTierHotelDropdown(null), 200)}
                                                                    onChange={(e) => {
                                                                        setLocalHotelSearch(e.target.value);
                                                                        const newPlans = [...tierPlans];
                                                                        newPlans[planIdx].stops[stopIdx].hotelName = e.target.value;
                                                                        setTierPlans(newPlans);
                                                                    }}
                                                                />
                                                                <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600 transition-transform ${openTierHotelDropdown?.planIdx === planIdx && openTierHotelDropdown?.stopIdx === stopIdx ? 'rotate-180' : ''}`} />
                                                            </div>
                                                            {openTierHotelDropdown?.planIdx === planIdx && openTierHotelDropdown?.stopIdx === stopIdx && (
                                                                <div className="absolute z-[50] w-[200%] sm:w-[150%] right-0 sm:left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto scroll-smooth animate-in fade-in slide-in-from-top-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}>
                                                                    <div className="py-2">
                                                                        {(() => {
                                                                            const filteredHotels = destHotels.filter((h: any) => {
                                                                                const hName = (h.hotelName || h.name || "").trim();
                                                                                if (!hName || hName === "+" || hName === "-") return false;

                                                                                const hLoc = (h.destination || h.subDestination || h.address || h.location || "").toLowerCase().trim();
                                                                                const sLoc = (stop.location || "").toLowerCase().trim();
                                                                                const locMatch = !stop.location || hLoc.includes(sLoc);
                                                                                
                                                                                // Filter by THIS hotel's chosen category; if none chosen, show all for the location.
                                                                                const hCat = (h.category || "").toLowerCase().trim();
                                                                                const sCat = (stop.category || "").toLowerCase().trim();
                                                                                const tierMatch = !sCat || sCat === "custom" || hCat === sCat;

                                                                                const searchMatch = !localHotelSearch || (h.hotelName || h.name || "").toLowerCase().includes(localHotelSearch.toLowerCase());
                                                                                return locMatch && tierMatch && searchMatch;
                                                                            });

                                                                            const exactMatchExists = localHotelSearch ? filteredHotels.some(h => (h.hotelName || h.name || "").toLowerCase().trim() === localHotelSearch.toLowerCase().trim()) : false;

                                                                            return (
                                                                                <>
                                                                                    {filteredHotels.map((hotel: any) => {
                                                                                        const basePrice = hotel.cpPrice || hotel.epPrice || hotel.mapPrice || hotel.apPrice || hotel.ratePerNight || 0;
                                                                                        return (
                                                                                            <div 
                                                                                                key={hotel.id} 
                                                                                                className="px-4 py-3 hover:bg-emerald-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0"
                                                                                                onMouseDown={(e) => {
                                                                                                    e.preventDefault();
                                                                                                    const newPlans = [...tierPlans];
                                                                                                    newPlans[planIdx].stops[stopIdx].hotelId = hotel.id;
                                                                                                    newPlans[planIdx].stops[stopIdx].hotelName = hotel.hotelName || hotel.name;
                                                                                                    const selectedRoom = hotel.roomCategories?.[0];
                                                                                                    newPlans[planIdx].stops[stopIdx].ratePerNight = hotel.cpPrice || basePrice;
                                                                                                    newPlans[planIdx].stops[stopIdx].location = hotel.address || hotel.location || newPlans[planIdx].stops[stopIdx].location;
                                                                                                    newPlans[planIdx].stops[stopIdx].starRating = hotel.starRating || selectedRoom?.starRating || 3;
                                                                                                    setTierPlans(newPlans);
                                                                                                    setOpenTierHotelDropdown(null);
                                                                                                }}
                                                                                            >
                                                                                                <div className="font-bold text-gray-900 text-xs">{hotel.hotelName || hotel.name}</div>
                                                                                                <div className="flex items-center gap-2 mt-1">
                                                                                                    <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">Starting from ₹{hotel.cpPrice || 0}</span>
                                                                                                </div>
                                                                                            </div>
                                                                                        )
                                                                                    })}

                                                                                    {filteredHotels.length === 0 && (
                                                                                        <div className="px-4 py-3 text-xs text-gray-400 italic">No hotels available for selected location and category.</div>
                                                                                    )}

                                                                                    {localHotelSearch && localHotelSearch.trim() !== "" && localHotelSearch !== stop.hotelName && !exactMatchExists && (
                                                                                        <div 
                                                                                            className="px-4 py-2.5 hover:bg-emerald-50 text-xs font-bold text-emerald-600 italic cursor-pointer flex items-center justify-between border-t border-gray-50"
                                                                                            onMouseDown={(e) => {
                                                                                                e.preventDefault();
                                                                                                const newPlans = [...tierPlans];
                                                                                                newPlans[planIdx].stops[stopIdx].hotelId = `custom-${Date.now()}`;
                                                                                                newPlans[planIdx].stops[stopIdx].hotelName = localHotelSearch;
                                                                                                newPlans[planIdx].stops[stopIdx].ratePerNight = 0;
                                                                                                setTierPlans(newPlans);
                                                                                                setOpenTierHotelDropdown(null);
                                                                                                toast({
                                                                                                    title: "Hotel Added",
                                                                                                    description: `Hotel "${localHotelSearch}" added to plan.`,
                                                                                                    variant: "default",
                                                                                                });
                                                                                            }}
                                                                                        >
                                                                                            <span className="flex items-center gap-1">
                                                                                                <span className="text-emerald-500 font-semibold">+</span> Add "{localHotelSearch.trim()}"
                                                                                            </span>
                                                                                            <Plus className="w-3.5 h-3.5" />
                                                                                        </div>
                                                                                    )}
                                                                                </>
                                                                            )
                                                                        })()}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Nights */}
                                                    <div className="sm:col-span-2 space-y-1.5">
                                                        <label className="font-sans text-xs sm:text-sm font-medium mb-1.5 flex items-center gap-1" style={labelStyle}>
                                                            <Calendar className="w-3.5 h-3.5" /> Nights *
                                                        </label>
                                                        <div className="flex items-center gap-2">
                                                            <input 
                                                                type="number" 
                                                                className="w-full min-w-[60px] pl-3 pr-2 py-3 bg-white rounded-xl border border-gray-200 text-sm font-sans font-bold text-gray-900 outline-none focus:border-emerald-500 shadow-sm transition-all text-center"
                                                                min={1}
                                                                value={stop.nights === 0 ? "" : stop.nights}
                                                                onFocus={e => { if (stop.nights === 0) e.target.value = "" }}
                                                                onChange={(e) => {
                                                                    let val = e.target.value.replace(/^0+/, '');
                                                                    const newPlans = [...tierPlans];
                                                                    if (val === "") newPlans[planIdx].stops[stopIdx].nights = 0;
                                                                    else newPlans[planIdx].stops[stopIdx].nights = Math.max(0, parseInt(val) || 0);
                                                                    setTierPlans(newPlans);
                                                                }}
                                                                onBlur={e => {
                                                                    if (e.target.value === "") {
                                                                        const newPlans = [...tierPlans];
                                                                        newPlans[planIdx].stops[stopIdx].nights = 0;
                                                                        setTierPlans(newPlans);
                                                                    }
                                                                }}
                                                            />
                                                            <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[9px] font-bold text-gray-300 uppercase">NTS</span>
                                                        </div>
                                                    </div>

                                                    {/* Meal Plan */}
                                                    <div className="sm:col-span-3 space-y-1.5">
                                                        <label className="font-sans text-xs sm:text-sm font-medium mb-1.5 flex items-center gap-1" style={labelStyle}>
                                                            <Users className="w-3.5 h-3.5" /> Meal Plan *
                                                        </label>
                                                        <div className="relative">
                                                            <select
                                                                className="w-full pl-4 pr-10 py-3 bg-white rounded-xl border border-gray-200 text-sm font-sans font-medium text-gray-900 appearance-none cursor-pointer focus:border-emerald-500 outline-none shadow-sm transition-all"
                                                                value={stop.mealPlan}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    const newPlans = [...tierPlans];
                                                                    newPlans[planIdx].stops[stopIdx].mealPlan = val;
                                                                    
                                                                    // Update price based on selected meal plan if hotel exists
                                                                    const hotel = destHotels.find(h => h.id === stop.hotelId);
                                                                    if (hotel) {
                                                                        const selectedRoom = hotel.roomCategories?.find((r: any) => r.roomType === stop.roomType);
                                                                        const priceSource = selectedRoom || hotel;
                                                                        
                                                                        if (val.startsWith("EP")) newPlans[planIdx].stops[stopIdx].ratePerNight = priceSource.epPrice || 0;
                                                                        else if (val.startsWith("CP")) newPlans[planIdx].stops[stopIdx].ratePerNight = priceSource.cpPrice || 0;
                                                                        else if (val.startsWith("MAP")) newPlans[planIdx].stops[stopIdx].ratePerNight = priceSource.mapPrice || 0;
                                                                        else if (val.startsWith("AP")) newPlans[planIdx].stops[stopIdx].ratePerNight = priceSource.apPrice || 0;
                                                                    }
                                                                    
                                                                    setTierPlans(newPlans);
                                                                }}
                                                            >
                                                                <option value="EP (No Meals)">EP (Room Only)</option>
                                                                <option value="CP (Breakfast)">CP (Breakfast)</option>
                                                                <option value="MAP (Breakfast + Dinner)">MAP (Half Board)</option>
                                                                <option value="AP (All Meals)">AP (Full Board)</option>
                                                            </select>
                                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600 pointer-events-none" />
                                                        </div>
                                                    </div>
                                                    {/* Room Type & Rate - New Row or flexible grid */}
                                                    <div className="sm:col-span-12 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100/50 mt-1">
                                                        <div className="space-y-1.5 px-1 relative">
                                                            <label className="font-sans text-xs sm:text-sm font-medium mb-1.5 block" style={labelStyle}>Room Category (Optional)</label>
                                                            <div 
                                                                ref={el => { roomDropdownRef.current[`${planIdx}-${stopIdx}`] = el }}
                                                                className="relative group/dropdown"
                                                            >
                                                                <div className="relative">
                                                                    <input 
                                                                        className="w-full pl-4 pr-10 py-2.5 bg-white/50 rounded-lg border border-gray-200 text-xs font-sans font-medium outline-none focus:border-emerald-400 transition-all animate-in fade-in"
                                                                        placeholder="Select or type room category"
                                                                        value={openTierRoomDropdown?.planIdx === planIdx && openTierRoomDropdown?.stopIdx === stopIdx ? localRoomSearch : (stop.roomType || "")}
                                                                        onFocus={(e) => {
                                                                            setOpenTierRoomDropdown({ planIdx, stopIdx });
                                                                            setLocalRoomSearch(stop.roomType || "");
                                                                            
                                                                            const inputEl = e.currentTarget;
                                                                            if (inputEl) {
                                                                                const rect = inputEl.getBoundingClientRect();
                                                                                const viewportHeight = window.innerHeight;
                                                                                const spaceBelow = viewportHeight - rect.bottom;
                                                                                const dropdownHeight = 220;
                                                                                
                                                                                const shouldOpenUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
                                                                                setOpenUpward(prev => ({
                                                                                    ...prev,
                                                                                    [`${planIdx}-${stopIdx}`]: shouldOpenUp
                                                                                }));
                                                                            }
                                                                        }}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setLocalRoomSearch(val);
                                                                            const newPlans = [...tierPlans];
                                                                            newPlans[planIdx].stops[stopIdx].roomType = val;
                                                                            setTierPlans(newPlans);
                                                                        }}
                                                                    />
                                                                    {loadingRooms[stop.hotelId || ""] ? (
                                                                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-600 animate-spin" />
                                                                    ) : (
                                                                        <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 transition-transform ${openTierRoomDropdown?.planIdx === planIdx && openTierRoomDropdown?.stopIdx === stopIdx ? 'rotate-180' : ''}`} />
                                                                    )}
                                                                </div>
                                                                {openTierRoomDropdown?.planIdx === planIdx && openTierRoomDropdown?.stopIdx === stopIdx && (
                                                                    <div 
                                                                        className={`absolute z-[50] w-full bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto scroll-smooth animate-in fade-in duration-200 ${
                                                                            openUpward[`${planIdx}-${stopIdx}`]
                                                                                ? "bottom-full mb-1.5 slide-in-from-bottom-2"
                                                                                : "top-full mt-1.5 slide-in-from-top-2"
                                                                        }`}
                                                                        style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}
                                                                    >
                                                                        <div className="py-2">
                                                                            {/* Default Standard option */}
                                                                            {(!localRoomSearch || "standard / default".includes(localRoomSearch.toLowerCase())) && (
                                                                                <div 
                                                                                    className="px-4 py-2 hover:bg-emerald-50 text-xs font-sans cursor-pointer transition-colors flex items-center justify-between border-b border-gray-50 last:border-0"
                                                                                    onMouseDown={(e) => {
                                                                                        e.preventDefault();
                                                                                        selectRoomCategory(planIdx, stopIdx, "");
                                                                                        setOpenTierRoomDropdown(null);
                                                                                    }}
                                                                                >
                                                                                    <span className="text-gray-500">Standard / Default</span>
                                                                                    {!stop.roomType && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                                                                                </div>
                                                                            )}
                                                                            
                                                                            {/* Filter and render available categories */}
                                                                            {getAvailableCategories(stop.hotelId || "")
                                                                                .filter((r: any) => {
                                                                                    if (!r.roomType) return false;
                                                                                    return !localRoomSearch || r.roomType.toLowerCase().includes(localRoomSearch.toLowerCase().trim());
                                                                                })
                                                                                .map((r: any) => (
                                                                                    <div 
                                                                                        key={r.roomType} 
                                                                                        className="px-4 py-2 hover:bg-emerald-50 text-xs font-sans cursor-pointer transition-colors flex items-center justify-between border-b border-gray-50 last:border-0"
                                                                                        onMouseDown={(e) => {
                                                                                            e.preventDefault();
                                                                                            selectRoomCategory(planIdx, stopIdx, r.roomType);
                                                                                            setOpenTierRoomDropdown(null);
                                                                                        }}
                                                                                    >
                                                                                        <span className="font-medium text-gray-900">{r.roomType}</span>
                                                                                        {stop.roomType === r.roomType && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                                                                                    </div>
                                                                                ))
                                                                            }

                                                                            {/* Empty state when no preset categories and nothing is typed */}
                                                                            {!localRoomSearch && getAvailableCategories(stop.hotelId || "").length === 0 && (
                                                                                <div className="px-4 py-3 text-xs text-gray-400 italic text-center">
                                                                                    No categories available for selected hotel
                                                                                </div>
                                                                            )}

                                                                            {/* Inline error when duplicate category typed */}
                                                                            {localRoomSearch && getAvailableCategories(stop.hotelId || "").some(r => r.roomType?.toLowerCase().trim() === localRoomSearch.toLowerCase().trim()) && (
                                                                                <div className="px-4 py-1.5 text-[10px] text-red-500 font-semibold italic border-t border-gray-50 bg-red-50/20">
                                                                                    Category already exists
                                                                                </div>
                                                                            )}

                                                                            {/* "+ Add '[typed text]'" row */}
                                                                            {localRoomSearch && localRoomSearch.trim() && !getAvailableCategories(stop.hotelId || "").some(r => r.roomType?.toLowerCase().trim() === localRoomSearch.toLowerCase().trim()) && (
                                                                                <div 
                                                                                    className="px-4 py-2.5 hover:bg-emerald-50 text-xs font-bold text-emerald-600 italic cursor-pointer flex items-center justify-between border-t border-gray-50"
                                                                                    onMouseDown={(e) => {
                                                                                        e.preventDefault();
                                                                                        handleAddRoomCategory(planIdx, stopIdx, stop.hotelId || "", localRoomSearch);
                                                                                    }}
                                                                                >
                                                                                    <span className="flex items-center gap-1">
                                                                                        <span className="text-emerald-500 font-semibold">+</span> Add "{localRoomSearch.trim()}"
                                                                                    </span>
                                                                                    <Plus className="w-3 h-3" />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>


                                                        <div className="space-y-1.5 px-1">
                                                            <label className="font-sans text-xs sm:text-sm font-medium mb-1.5 block" style={labelStyle}>Rate per Night (₹) *</label>
                                                            <div className="relative">
                                                                <input 
                                                                    type="number"
                                                                    className="w-full pl-4 pr-32 py-2.5 bg-white/50 rounded-lg border border-gray-200 text-xs font-sans font-bold text-emerald-700 outline-none focus:border-emerald-400 transition-all"
                                                                    value={stop.ratePerNight === 0 ? "" : stop.ratePerNight}
                                                                    onFocus={e => { if (stop.ratePerNight === 0) e.target.value = "" }}
                                                                    onChange={(e) => {
                                                                        let val = e.target.value.replace(/^0+/, '');
                                                                        const newPlans = [...tierPlans];
                                                                        if (val === "") newPlans[planIdx].stops[stopIdx].ratePerNight = 0;
                                                                        else newPlans[planIdx].stops[stopIdx].ratePerNight = Math.max(0, parseInt(val) || 0);
                                                                        setTierPlans(newPlans);
                                                                    }}
                                                                    onBlur={e => {
                                                                        if (e.target.value === "") {
                                                                            const newPlans = [...tierPlans];
                                                                            newPlans[planIdx].stops[stopIdx].ratePerNight = 0;
                                                                            setTierPlans(newPlans);
                                                                        }
                                                                    }}
                                                                />
                                                                <div className="absolute right-9 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-emerald-100/50 px-2 py-1 rounded text-[9px] font-bold text-emerald-700">
                                                                    TOTAL: ₹{(stop.ratePerNight * stop.nights).toLocaleString()}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4 mt-3">
                                                            <div className="space-y-1.5">
                                                                <label className="font-sans text-xs font-medium mb-1.5 block whitespace-nowrap" style={labelStyle}>Number of Rooms *</label>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    value={(stop.numberOfRooms === undefined || stop.numberOfRooms === null || stop.numberOfRooms === 0) ? "" : stop.numberOfRooms}
                                                                    placeholder="Enter number of rooms"
                                                                    onFocus={(e) => { if (stop.numberOfRooms === 0 || stop.numberOfRooms === 1) e.target.value = "" }}
                                                                    onChange={(e) => {
                                                                        let val = e.target.value.replace(/^0+/, '');
                                                                        const newPlans = [...tierPlans];
                                                                        if (val === "") newPlans[planIdx].stops[stopIdx].numberOfRooms = 0;
                                                                        else newPlans[planIdx].stops[stopIdx].numberOfRooms = Math.max(0, parseInt(val) || 0);
                                                                        setTierPlans(newPlans);
                                                                    }}
                                                                    onBlur={(e) => {
                                                                        if (e.target.value === "" || stop.numberOfRooms === 0) {
                                                                            const newPlans = [...tierPlans];
                                                                            newPlans[planIdx].stops[stopIdx].numberOfRooms = 1;
                                                                            setTierPlans(newPlans);
                                                                        }
                                                                    }}
                                                                    className="w-full pl-4 pr-4 py-3 bg-white rounded-xl border border-gray-200 text-sm font-sans font-bold text-gray-900 outline-none focus:border-emerald-500 shadow-sm transition-all"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <label className="font-sans text-xs font-medium mb-1.5 block whitespace-nowrap" style={labelStyle} title="Extra Beds / Child With Bed (Optional)">Child With Bed / CWB</label>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    value={(stop.numberOfExtraBeds === undefined || stop.numberOfExtraBeds === null || stop.numberOfExtraBeds === 0) ? "" : stop.numberOfExtraBeds}
                                                                    placeholder="Enter number of extra beds"
                                                                    onFocus={(e) => { if (stop.numberOfExtraBeds === 0) e.target.value = "" }}
                                                                    onChange={(e) => {
                                                                        let val = e.target.value.replace(/^0+/, '');
                                                                        const newPlans = [...tierPlans];
                                                                        if (val === "") newPlans[planIdx].stops[stopIdx].numberOfExtraBeds = 0;
                                                                        else newPlans[planIdx].stops[stopIdx].numberOfExtraBeds = Math.max(0, parseInt(val) || 0);
                                                                        setTierPlans(newPlans);
                                                                    }}
                                                                    onBlur={(e) => {
                                                                        if (e.target.value === "") {
                                                                            const newPlans = [...tierPlans];
                                                                            newPlans[planIdx].stops[stopIdx].numberOfExtraBeds = 0;
                                                                            setTierPlans(newPlans);
                                                                        }
                                                                    }}
                                                                    className="w-full pl-4 pr-4 py-3 bg-white rounded-xl border border-gray-200 text-sm font-sans font-bold text-gray-900 outline-none focus:border-emerald-500 shadow-sm transition-all"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <label className="font-sans text-xs font-medium mb-1.5 block whitespace-nowrap" style={labelStyle} title="Child Without Bed (Optional)">Child Without Bed / CWoB</label>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    value={(stop.childWithoutBed === undefined || stop.childWithoutBed === null || stop.childWithoutBed === 0) ? "" : stop.childWithoutBed}
                                                                    placeholder="Enter number of children without bed"
                                                                    onFocus={(e) => { if (!stop.childWithoutBed) e.target.value = "" }}
                                                                    onChange={(e) => {
                                                                        let val = e.target.value.replace(/^0+/, '');
                                                                        const newPlans = [...tierPlans];
                                                                        if (val === "") newPlans[planIdx].stops[stopIdx].childWithoutBed = 0;
                                                                        else newPlans[planIdx].stops[stopIdx].childWithoutBed = Math.max(0, parseInt(val) || 0);
                                                                        setTierPlans(newPlans);
                                                                    }}
                                                                    onBlur={(e) => {
                                                                        if (e.target.value === "") {
                                                                            const newPlans = [...tierPlans];
                                                                            newPlans[planIdx].stops[stopIdx].childWithoutBed = 0;
                                                                            setTierPlans(newPlans);
                                                                        }
                                                                    }}
                                                                    className="w-full pl-4 pr-4 py-3 bg-white rounded-xl border border-gray-200 text-sm font-sans font-bold text-gray-900 outline-none focus:border-emerald-500 shadow-sm transition-all"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {stopIdx < plan.stops.length - 1 && (
                                                    <div className="flex justify-center my-4">
                                                        <div className="w-px h-8 bg-dashed bg-emerald-100" style={{ backgroundImage: 'linear-gradient(to bottom, #d1fae5 50%, rgba(255,255,255,0) 0%)', backgroundPosition: 'right', backgroundSize: '1px 8px', backgroundRepeat: 'repeat-y' }}></div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        <div className={`mt-8 pt-6 border-t border-dashed border-gray-200 flex justify-center relative z-[2] ${isAnyDropdownOpen ? 'invisible pointer-events-none' : 'visible'}`}>
                                            <button 
                                                onClick={() => {
                                                    const newPlans = [...tierPlans];
                                                    newPlans[planIdx].stops.push({ location: "", hotelId: "", hotelName: "", nights: 1, mealPlan: "CP (Breakfast)", roomType: "", ratePerNight: 0 });
                                                    setTierPlans(newPlans);
                                                }}
                                                className="px-6 py-4 rounded-xl border border-dashed border-emerald-100 bg-emerald-50/20 text-[#059669] font-sans text-xs font-bold uppercase tracking-widest flex hover:bg-emerald-50 transition-all items-center justify-center gap-1.5"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', position: 'relative', zIndex: 2 }}
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                Add Another Hotel to this Plan
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* STEP 3: Transfers */}
                {step === 3 && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#ecfdf5' }}><Car className="w-3.5 h-3.5" style={{ color: '#059669' }} /></div>
                            <div>
                                <h2 className="font-serif text-lg sm:text-xl tracking-wide" style={{ color: '#052210' }}>Transfers</h2>
                                <p className="font-sans text-[11px]" style={{ color: '#9ca3af' }}>{destVehicles.length > 0 ? `Suggested vehicles for ${adults + children} pax` : "Configure vehicle transfers"}</p>
                            </div>
                        </div>
                        {transfers.map((t, idx) => (
                            <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-xl relative" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                                <div>
                                    <label className={labelClass} style={labelStyle}>Transfer Type <span className="text-red-500">*</span></label>
                                    <select className={inputClass} style={selectStyle} value={t.type} onChange={e => { const tr = [...transfers]; tr[idx].type = e.target.value; setTransfers(tr) }}>
                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="Arrival">Arrival Transfer</option>
                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="Departure">Departure Transfer</option>
                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="Sightseeing">Sightseeing</option>
                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="InterCity">Inter-City</option>
                                    </select>
                                </div>

                                <div>
                                    <label className={labelClass} style={labelStyle}>Pickup Location <span className="text-red-500">*</span></label>
                                    {destTransfers.length > 0 ? (
                                        <select className={inputClass} style={selectStyle} value={t.pickup} onChange={e => { const tr = [...transfers]; tr[idx].pickup = e.target.value; setTransfers(tr) }}>
                                            <option style={{ color: '#000', backgroundColor: '#fff' }} value="">Select pickup location</option>
                                            {destTransfers.filter(dt => dt.type === "Pickup" || dt.type === "Both").map(dt => (
                                                <option key={`pickup-${dt.id}`} style={{ color: '#000', backgroundColor: '#fff' }} value={dt.pointName}>{dt.pointName}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input className={inputClass} style={inputStyle} placeholder="Enter pickup location" value={t.pickup || ""} onChange={e => { const tr = [...transfers]; tr[idx].pickup = e.target.value; setTransfers(tr) }} />
                                    )}
                                </div>

                                <div>
                                    <label className={labelClass} style={labelStyle}>Drop Location <span className="text-red-500">*</span></label>
                                    {destTransfers.length > 0 ? (
                                        <select className={inputClass} style={selectStyle} value={t.drop} onChange={e => { const tr = [...transfers]; tr[idx].drop = e.target.value; setTransfers(tr) }}>
                                            <option style={{ color: '#000', backgroundColor: '#fff' }} value="">Select drop location</option>
                                            {destTransfers.filter(dt => dt.type === "Drop" || dt.type === "Both").map(dt => (
                                                <option key={`drop-${dt.id}`} style={{ color: '#000', backgroundColor: '#fff' }} value={dt.pointName}>{dt.pointName}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input className={inputClass} style={inputStyle} placeholder="Enter drop location" value={t.drop || ""} onChange={e => { const tr = [...transfers]; tr[idx].drop = e.target.value; setTransfers(tr) }} />
                                    )}
                                </div>

                                <div>
                                    <label className={labelClass} style={labelStyle}>Vehicle Type <span className="text-red-500">*</span></label>
                                    {destVehicles.length > 0 ? (
                                        <select className={inputClass} style={selectStyle} value={t.vehicleType} onChange={e => {
                                            const tr = [...transfers]
                                            const v = destVehicles.find((v: any) => v.vehicleType === e.target.value)
                                            tr[idx].vehicleType = e.target.value
                                            tr[idx].price = v?.pricePerDay || 0
                                            setTransfers(tr)
                                        }}>
                                            <option style={{ color: '#000', backgroundColor: '#fff' }} value="">Select vehicle</option>
                                            {destVehicles.map((v: any) => <option style={{ color: '#000', backgroundColor: '#fff' }} key={v.id} value={v.vehicleType}>{v.vehicleType} (max {v.maxPax}) — ₹{v.pricePerDay}/day</option>)}
                                        </select>
                                    ) : (
                                        <input className={inputClass} style={inputStyle} placeholder="Enter vehicle type" value={t.vehicleType} onChange={e => { const tr = [...transfers]; tr[idx].vehicleType = e.target.value; setTransfers(tr) }} />
                                    )}
                                </div>
                                <div>
                                    <label className={labelClass} style={labelStyle}>Price (₹) <span className="text-red-500">*</span></label>
                                    <input type="number" className={`${inputClass} pr-10`} style={inputStyle} placeholder="Enter transfer price" value={t.price === 0 ? "" : t.price} onFocus={e => { if (t.price === 0) e.target.value = "" }} onChange={e => { let val = e.target.value.replace(/^0+/, ''); const tr = [...transfers]; if (val === "") tr[idx].price = 0; else tr[idx].price = Math.max(0, parseInt(val) || 0); setTransfers(tr); }} onBlur={e => { if (e.target.value === "") { const tr = [...transfers]; tr[idx].price = 0; setTransfers(tr); } }} />
                                </div>
                                <button onClick={() => setTransfers(transfers.filter((_, i) => i !== idx))} className="absolute top-2 right-2 p-1.5 rounded-xl hover:bg-red-50 transition-colors" title="Remove">
                                    <Trash2 className="w-4 h-4" style={{ color: '#ef4444' }} />
                                </button>
                            </div>
                        ))}
                        <button onClick={() => setTransfers([...transfers, { type: "Sightseeing", pickup: "", drop: "", vehicleType: "", price: 0 }])} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-sans text-xs font-semibold tracking-wider uppercase transition-all hover:bg-emerald-50" style={{ color: '#059669', border: '1px solid #a7f3d0' }}>
                            <Plus className="w-3.5 h-3.5" /> Add Transfer
                        </button>
                    </div>
                )}

                {/* STEP 4: Activities */}
                {step === 4 && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#ecfdf5' }}><Map className="w-3.5 h-3.5" style={{ color: '#059669' }} /></div>
                            <div>
                                <h2 className="font-serif text-lg sm:text-xl tracking-wide" style={{ color: '#052210' }}>Attractions & Activities</h2>
                                <p className="font-sans text-[11px]" style={{ color: '#9ca3af' }}>Select experiences to include</p>
                            </div>
                        </div>
                        {destAttractions.length === 0 ? (
                            <div className="text-center py-10 rounded-xl" style={{ background: '#f9fafb', border: '2px dashed #d1d5db' }}>
                                <Map className="w-10 h-10 mx-auto mb-3" style={{ color: '#d1d5db' }} />
                                <p className="font-sans text-sm" style={{ color: '#9ca3af' }}>No attractions found for this destination</p>
                            </div>
                        ) : destAttractions.map((attr: any) => {
                            const isAttrSelected = selectedActivities.some((a: any) => a.id === attr.id && !a.isActivity)

                            return (
                                <div key={attr.id} className="p-4 rounded-xl transition-all duration-200" style={{ background: isAttrSelected ? '#ecfdf5' : '#f9fafb', border: isAttrSelected ? '1px solid #059669' : '1px solid #e5e7eb', borderLeft: isAttrSelected ? '4px solid #059669' : '4px solid transparent' }}>
                                    <div
                                        onClick={() => {
                                            if (isAttrSelected) setSelectedActivities(selectedActivities.filter((a: any) => !(a.id === attr.id && !a.isActivity)))
                                            else setSelectedActivities([...selectedActivities, { ...attr, isActivity: false }])
                                        }}
                                        className="flex items-center gap-3 sm:gap-4 cursor-pointer"
                                    >
                                        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: isAttrSelected ? '#059669' : '#e5e7eb', transition: 'all 0.2s' }}>
                                            {isAttrSelected && <Check className="w-4 h-4" style={{ color: '#FFFFFF' }} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-sans text-sm font-semibold truncate" style={{ color: '#052210' }}>{attr.name} <span className="text-[10px] text-gray-500 font-normal ml-2 uppercase tracking-wider">Entry Ticket</span></p>
                                            <p className="font-sans text-xs truncate" style={{ color: '#6b7280' }}>
                                                {attr.category || "—"} · ₹{attr.entryFee || 0}
                                            </p>
                                        </div>
                                        <span className="font-sans text-sm font-bold flex-shrink-0" style={{ color: '#059669' }}>₹{((attr.entryFee || 0) * (adults + children)).toLocaleString()}</span>
                                    </div>

                                    {/* Nested Activities */}
                                    {attr.activities && attr.activities.length > 0 && (
                                        <div className="mt-4 pl-10 space-y-3 border-t pt-3" style={{ borderColor: 'rgba(5,34,16,0.05)' }}>
                                            {attr.activities.map((act: any, idx: number) => {
                                                const uniqueId = `${attr.id}_act_${idx}`
                                                const isActSelected = selectedActivities.some((a: any) => a.id === uniqueId && a.isActivity)
                                                // Activity pricing includes price + vehiclePrice if any
                                                const basePrice = (act.price || 0) + (act.vehiclePrice || 0)
                                                return (
                                                    <div
                                                        key={idx}
                                                        onClick={() => {
                                                            if (isActSelected) setSelectedActivities(selectedActivities.filter((a: any) => !(a.id === uniqueId && a.isActivity)))
                                                            else setSelectedActivities([...selectedActivities, { ...act, id: uniqueId, isActivity: true, parentAttraction: attr.name }])
                                                        }}
                                                        className="flex items-center gap-3 cursor-pointer"
                                                    >
                                                        <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: isActSelected ? '#059669' : '#e5e7eb', transition: 'all 0.2s' }}>
                                                            {isActSelected && <Check className="w-3 h-3" style={{ color: '#FFFFFF' }} />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-sans text-xs font-semibold truncate" style={{ color: '#052210' }}>{act.name} <span className="text-[10px] text-gray-400 font-normal ml-1 tracking-wider uppercase">Activity</span></p>
                                                            <p className="font-sans text-[10px] truncate" style={{ color: '#6b7280' }}>
                                                                ₹{act.price || 0} {act.vehiclePrice ? `+ ₹${act.vehiclePrice} Vehicle` : ''}
                                                            </p>
                                                        </div>
                                                        <span className="font-sans text-xs font-bold flex-shrink-0" style={{ color: '#059669' }}>₹{(basePrice * (adults + children)).toLocaleString()}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* STEP 5: Day Plan */}
                {step === 5 && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#ecfdf5' }}><Sun className="w-3.5 h-3.5" style={{ color: '#059669' }} /></div>
                            <div>
                                <h2 className="font-serif text-lg sm:text-xl tracking-wide" style={{ color: '#052210' }}>Day Plan</h2>
                                <p className="font-sans text-[11px]" style={{ color: '#9ca3af' }}>Plan each day of the trip</p>
                            </div>
                        </div>
                        {dayPlans.length === 0 ? (
                            <div className="text-center py-10 rounded-xl" style={{ background: '#f9fafb', border: '2px dashed #d1d5db' }}>
                                <Sun className="w-10 h-10 mx-auto mb-3" style={{ color: '#d1d5db' }} />
                                <p className="font-sans text-sm" style={{ color: '#9ca3af' }}>Set start and end dates in Step 1 first</p>
                            </div>
                        ) : dayPlans.map((day, idx) => (
                            <div key={idx} className="flex gap-3 sm:gap-5">
                                {/* Timeline */}
                                <div className="flex flex-col items-center flex-shrink-0">
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold shadow-sm" style={{ background: 'linear-gradient(135deg, #059669, #06a15c)', color: '#FFFFFF', fontSize: '11px', boxShadow: '0 2px 8px rgba(5,150,105,0.25)' }}>
                                        {idx + 1}
                                    </div>
                                    {idx < dayPlans.length - 1 && <div className="w-0.5 flex-1 mt-1 rounded-full" style={{ background: 'linear-gradient(180deg, #a7f3d0, #d1fae5)' }} />}
                                </div>
                                {/* Content Card */}
                                <div className="flex-1 min-w-0 mb-2">
                                    <div className="rounded-xl p-4 sm:p-5 space-y-4" style={{ background: '#FFFFFF', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                        {/* Day Header */}
                                        <div className="space-y-3 w-full border-b pb-4 mb-2" style={{ borderColor: 'rgba(5,34,16,0.05)' }}>
                                            <div className="flex items-center gap-3">
                                                <span className="font-sans text-sm font-bold tracking-tight whitespace-nowrap" style={{ color: '#052210' }}>{day.day}</span>
                                                <span className="font-sans text-[10px] px-2.5 py-1 rounded-md font-medium" style={{ background: '#f3f4f6', color: '#6b7280' }}>{day.date}</span>
                                            </div>
                                            <div className="w-full relative">
                                                <label className={labelClass} style={labelStyle}>Load Preset Day (Optional)</label>
                                                <div className="relative group/dropdown">
                                                    <div className="relative">
                                                        <input 
                                                            className="w-full px-3 py-2.5 text-xs rounded-lg font-sans font-semibold tracking-wide outline-none transition-all border pr-10"
                                                            style={{ 
                                                                background: '#FFFFFF', 
                                                                color: '#052210', 
                                                                borderColor: '#e5e7eb', 
                                                            }}
                                                            placeholder={destPresetDays.length > 0 ? "Search or Type Preset Day..." : "No preset days found"}
                                                            value={openPresetDropdown === idx ? localPresetSearch : ""}
                                                            onFocus={() => {
                                                                if (destPresetDays.length > 0) {
                                                                    setOpenPresetDropdown(idx);
                                                                    setLocalPresetSearch("");
                                                                }
                                                            }}
                                                            onBlur={() => setTimeout(() => setOpenPresetDropdown(null), 200)}
                                                            onChange={(e) => setLocalPresetSearch(e.target.value)}
                                                            disabled={destPresetDays.length === 0}
                                                        />
                                                        <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-600 transition-transform duration-200 ${openPresetDropdown === idx ? 'rotate-180' : ''}`} />
                                                    </div>

                                                    {openPresetDropdown === idx && (
                                                        <div className="absolute z-[110] w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.15)] max-h-80 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
                                                            <div className="overflow-y-auto py-1 custom-scrollbar max-h-80">
                                                                {destPresetDays
                                                                    .filter(p => !localPresetSearch || (p.title || "").toLowerCase().includes(localPresetSearch.toLowerCase()))
                                                                    .map((p) => (
                                                                        <div 
                                                                            key={p.id} 
                                                                            className="px-4 py-3.5 hover:bg-emerald-50/50 text-xs font-sans cursor-pointer transition-colors border-b border-gray-50 last:border-0 group/item"
                                                                            onMouseDown={(e) => { 
                                                                                e.preventDefault();
                                                                                const d = [...dayPlans];
                                                                                d[idx].title = p.title || "";
                                                                                d[idx].description = p.description || "";
                                                                                d[idx].highlights = p.highlights || [];
                                                                                d[idx].optionalPrice = p.optionalPrice || 0;
                                                                                d[idx].optionalPriceDescription = p.optionalPriceDescription || "";
                                                                                d[idx].subDestination = p.subDestination || "";
                                                                                d[idx].overnightStay = p.overnightStayHotel || "";
                                                                                setDayPlans(d);
                                                                                setOpenPresetDropdown(null);
                                                                            }}
                                                                        >
                                                                            <div className="font-bold text-[#052210] leading-snug group-hover/item:text-emerald-700 transition-colors">{p.title}</div>
                                                                            <div className="flex items-center gap-2 mt-1.5">
                                                                                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium uppercase tracking-tighter">
                                                                                    {p.subDestination || "Default"}
                                                                                </span>
                                                                                {p.overnightStayHotel && (
                                                                                    <span className="text-[10px] text-emerald-600 font-semibold truncate">
                                                                                        • {p.overnightStayHotel}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                {localPresetSearch && !destPresetDays.some(p => (p.title || "").toLowerCase() === localPresetSearch.toLowerCase()) && (
                                                                    <div 
                                                                        className="px-4 py-3.5 hover:bg-emerald-50/50 text-xs font-bold text-emerald-600 italic cursor-pointer flex items-center justify-between border-t border-gray-50"
                                                                        onMouseDown={(e) => {
                                                                            e.preventDefault();
                                                                            const d = [...dayPlans];
                                                                            d[idx].title = localPresetSearch;
                                                                            setDayPlans(d);
                                                                            setOpenPresetDropdown(null);
                                                                        }}
                                                                    >
                                                                        ➕ Add Custom Day: "{localPresetSearch}"
                                                                        <Plus className="w-3.5 h-3.5" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Title & Description */}
                                        <div className="space-y-3">
                                            <div>
                                                <label className={labelClass} style={labelStyle}>Day Title <span className="text-red-500">*</span></label>
                                                {/* Set only from the destination's preset day plans (no manual typing). */}
                                                <input className={inputClass} style={{ ...inputStyle, fontWeight: 600, background: '#f8faf9', cursor: 'not-allowed' }} placeholder="Select a preset day above" value={day.title} readOnly title="Choose a preset day from 'Load Preset Day' above" />
                                            </div>
                                            <div>
                                                <label className={labelClass} style={labelStyle}>Description <span className="text-red-500">*</span></label>
                                                <textarea className={`${inputClass} resize-none`} style={{ ...inputStyle, minHeight: '72px', background: '#f8faf9', cursor: 'not-allowed' }} placeholder="Loaded from the selected preset day" value={day.description} readOnly title="Choose a preset day from 'Load Preset Day' above" />
                                            </div>
                                        </div>
                                          {/* Location - Custom Searchable Dropdowns - Hidden for last day */}
                                        {idx < dayPlans.length - 1 && (
                                            <div className="animate-fade-in mb-3">
                                                <div className="relative">
                                                    <label className={labelClass} style={labelStyle}>Overnight Stay Location (Optional)</label>
                                                    <div className="relative group">
                                                        {/* Select-only — choose from the destination's locations; no manual typing */}
                                                        <input
                                                            className={`${inputClass} pr-10`}
                                                            style={{ ...inputStyle, cursor: 'pointer', background: '#f8faf9' }}
                                                            placeholder="Select overnight stay location"
                                                            value={day.overnightStay || ""}
                                                            readOnly
                                                            onFocus={() => { setOpenHotelDropdown(idx); setLocalHotelSearch("") }}
                                                            onBlur={() => setTimeout(() => setOpenHotelDropdown(null), 200)}
                                                        />
                                                        <button 
                                                            type="button" 
                                                            className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 transition-opacity"
                                                            onClick={() => setOpenHotelDropdown(openHotelDropdown === idx ? null : idx)}
                                                        >
                                                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${openHotelDropdown === idx ? 'rotate-180' : ''}`} />
                                                        </button>
                                                        
                                                        {openHotelDropdown === idx && (
                                                            <div className="absolute z-[100] w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-56 overflow-auto py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                                                {localHotelSearch && !(destinations?.find((d: any) => d.id === destinationId)?.subDestinations || []).includes(localHotelSearch) && (
                                                                    <div 
                                                                        className="px-4 py-2.5 hover:bg-emerald-50 text-sm font-sans cursor-pointer italic text-emerald-600 flex items-center justify-between border-b border-gray-50"
                                                                        onMouseDown={(e) => {
                                                                            e.preventDefault();
                                                                            const d = [...dayPlans]; d[idx].overnightStay = localHotelSearch; setDayPlans(d); setOpenHotelDropdown(null);
                                                                        }}
                                                                    >
                                                                        Add "{localHotelSearch}"
                                                                        <Plus className="w-3.5 h-3.5" />
                                                                    </div>
                                                                )}
                                                                {(destinations?.find((d: any) => d.id === destinationId)?.subDestinations || [])
                                                                    .slice()
                                                                    .sort((a, b) => {
                                                                        const s = (localHotelSearch || "").toLowerCase().trim();
                                                                        if (!s) return a.localeCompare(b);
                                                                        const aMatch = a.toLowerCase().includes(s);
                                                                        const bMatch = b.toLowerCase().includes(s);
                                                                        if (aMatch && !bMatch) return -1;
                                                                        if (!aMatch && bMatch) return 1;
                                                                        return a.localeCompare(b);
                                                                    })
                                                                    .map((loc: string) => (
                                                                        <div 
                                                                           key={loc} 
                                                                           className="px-4 py-2.5 hover:bg-emerald-50 text-sm font-sans cursor-pointer transition-colors flex items-center justify-between"
                                                                           onMouseDown={(e) => {
                                                                               e.preventDefault();
                                                                               const d = [...dayPlans]; d[idx].overnightStay = loc; setDayPlans(d); setOpenHotelDropdown(null);
                                                                           }}
                                                                        >
                                                                            <span style={{ color: '#052210' }}>{loc}</span>
                                                                            {day.overnightStay === loc && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                                                                        </div>
                                                                    ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="pt-2">
                                            <label className={labelClass} style={labelStyle}>Highlights (Optional)</label>
                                            <input className={inputClass} style={inputStyle} placeholder="Enter highlights, separated by commas" value={day.highlights?.join(",") || ""} onChange={e => { const d = [...dayPlans]; d[idx].highlights = e.target.value.split(","); setDayPlans(d) }} />
                                        </div>

                                        {/* Optional Pricing - hidden in package mode */}
                                        {(mode !== "package" && itinModule !== "built-package") && (
                                        <div className="pt-3" style={{ borderTop: '1px solid #f3f4f6' }}>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div>
                                                    <label className={labelClass} style={labelStyle}>Optional Cost (₹)</label>
                                                    <input type="number" className={`${inputClass} pr-10`} style={inputStyle} placeholder="Enter optional cost" value={day.optionalPrice || ""} onFocus={e => { if (!day.optionalPrice) e.target.value = "" }} onChange={e => { let val = e.target.value.replace(/^0+/, ''); const d = [...dayPlans]; if (val === "") d[idx].optionalPrice = 0; else d[idx].optionalPrice = Math.max(0, parseInt(val) || 0); setDayPlans(d); }} onBlur={e => { if (e.target.value === "") { const d = [...dayPlans]; d[idx].optionalPrice = 0; setDayPlans(d); } }} />
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <label className={labelClass} style={labelStyle}>Optional Item Description</label>
                                                    <input className={inputClass} style={inputStyle} placeholder="Enter optional item description" value={day.optionalPriceDescription || ""} onChange={e => { const d = [...dayPlans]; d[idx].optionalPriceDescription = e.target.value; setDayPlans(d) }} />
                                                </div>
                                            </div>
                                        </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* STEP 6: Inclusions & Notes */}
                {step === 6 && (() => {
                    // Seed from destination defaults on first visit
                    const selectedDest = destinations.find((d: any) => d.id === destinationId)
                    const destPdf = selectedDest?.pdfTemplate || {}
                    if (!inclusionsSeeded && overrideInclusions === null) {
                        // Use setTimeout to avoid setState during render
                        setTimeout(() => {
                            setOverrideInclusions([...(destPdf.inclusions || [])])
                            setOverrideExclusions([...(destPdf.exclusions || [])])
                            setOverrideImportantNotes([...(destPdf.importantNotes || [])])
                            setOverrideTermsConditions([...(destPdf.termsAndConditions || [])])
                            setOverridePaymentPolicy([...(destPdf.paymentPolicy || [])])
                            setOverrideCancellationPolicy([...(destPdf.cancellationPolicy || [])])
                            setInclusionsSeeded(true)
                        }, 0)
                    }

                    // Track original defaults for comparison
                    const defaults: Record<string, string[]> = {
                        inclusions: destPdf.inclusions || [],
                        exclusions: destPdf.exclusions || [],
                        importantNotes: destPdf.importantNotes || [],
                        termsConditions: destPdf.termsAndConditions || [],
                        paymentPolicy: destPdf.paymentPolicy || [],
                        cancellationPolicy: destPdf.cancellationPolicy || [],
                    }

                    const sections = [
                        { key: "inclusions", label: "Inclusions", data: overrideInclusions, setter: setOverrideInclusions, icon: "✓", color: "#059669", bgColor: "#ecfdf5", borderColor: "#a7f3d0" },
                        { key: "exclusions", label: "Exclusions", data: overrideExclusions, setter: setOverrideExclusions, icon: "✕", color: "#dc2626", bgColor: "#fef2f2", borderColor: "#fecaca" },
                        { key: "importantNotes", label: "Important Notes", data: overrideImportantNotes, setter: setOverrideImportantNotes, icon: "⚠", color: "#d97706", bgColor: "#fffbeb", borderColor: "#fde68a" },
                        { key: "termsConditions", label: "Terms & Conditions", data: overrideTermsConditions, setter: setOverrideTermsConditions, icon: "§", color: "#4f46e5", bgColor: "#eef2ff", borderColor: "#c7d2fe" },
                        { key: "paymentPolicy", label: "Payment Policy", data: overridePaymentPolicy, setter: setOverridePaymentPolicy, icon: "₹", color: "#0891b2", bgColor: "#ecfeff", borderColor: "#a5f3fc" },
                        { key: "cancellationPolicy", label: "Cancellation Policy", data: overrideCancellationPolicy, setter: setOverrideCancellationPolicy, icon: "⊘", color: "#be185d", bgColor: "#fdf2f8", borderColor: "#fbcfe8" },
                    ]

                    const checkIfCustomised = () => {
                        const checks = sections.map(s => {
                            const current = s.data || []
                            const def = defaults[s.key] || []
                            if (current.length !== def.length) return true
                            return current.some((item, i) => item !== def[i])
                        })
                        return checks.some(Boolean)
                    }

                    const handleItemEdit = (section: typeof sections[0], idx: number, value: string) => {
                        const arr = [...(section.data || [])]
                        arr[idx] = value
                        section.setter(arr)
                        setTimeout(() => setInclusionsCustomised(checkIfCustomised()), 0)
                    }

                    const handleItemDelete = (section: typeof sections[0], idx: number) => {
                        const arr = [...(section.data || [])]
                        arr.splice(idx, 1)
                        section.setter(arr)
                        setTimeout(() => setInclusionsCustomised(checkIfCustomised()), 0)
                    }

                    const handleItemAdd = (section: typeof sections[0]) => {
                        const arr = [...(section.data || []), ""]
                        section.setter(arr)
                        setTimeout(() => setInclusionsCustomised(true), 0)
                    }

                    const handleItemReorder = (section: typeof sections[0], from: number, to: number) => {
                        const arr = [...(section.data || [])]
                        const [moved] = arr.splice(from, 1)
                        arr.splice(to, 0, moved)
                        section.setter(arr)
                        setTimeout(() => setInclusionsCustomised(checkIfCustomised()), 0)
                    }

                    const handleResetSection = (section: typeof sections[0]) => {
                        const def = [...(defaults[section.key] || [])]
                        section.setter(def)
                        setTimeout(() => {
                            // Re-check all sections after this reset
                            const isCustom = sections.some(s => {
                                const current = s.key === section.key ? def : (s.data || [])
                                const d = defaults[s.key] || []
                                if (current.length !== d.length) return true
                                return current.some((item, i) => item !== d[i])
                            })
                            setInclusionsCustomised(isCustom)
                        }, 0)
                    }

                    const getItemStatus = (sectionKey: string, idx: number, value: string) => {
                        const def = defaults[sectionKey] || []
                        if (idx >= def.length) return "new"
                        if (value !== def[idx]) return "edited"
                        return "unchanged"
                    }

                    return (
                        <div className="space-y-5">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#ecfdf5' }}><FileText className="w-3.5 h-3.5" style={{ color: '#059669' }} /></div>
                                <div className="flex-1">
                                    <h2 className="font-serif text-lg sm:text-xl tracking-wide" style={{ color: '#052210' }}>Inclusions & Notes</h2>
                                    <p className="font-sans text-[11px]" style={{ color: '#9ca3af' }}>Customise inclusions, exclusions, terms & policies for this trip</p>
                                </div>
                                {/* Source badge */}
                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-sans text-[10px] font-bold tracking-wider uppercase ${inclusionsCustomised ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`} style={{ border: '1px solid' }}>
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: inclusionsCustomised ? '#0d9488' : '#d97706' }} />
                                    {inclusionsCustomised ? "Customised" : "Destination Defaults"}
                                </div>
                            </div>

                            {!destinationId && (
                                <div className="text-center py-10 rounded-xl" style={{ background: '#f9fafb', border: '2px dashed #d1d5db' }}>
                                    <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: '#d1d5db' }} />
                                    <p className="font-sans text-sm" style={{ color: '#9ca3af' }}>Select a destination in Step 1 to load default content</p>
                                </div>
                            )}

                            {destinationId && sections.map(section => {
                                const items = section.data || []
                                const isExpanded = expandedIncSections[section.key]
                                const editedCount = items.filter((_, i) => getItemStatus(section.key, i, items[i]) !== "unchanged").length
                                const isDefault = !items.some((item, i) => getItemStatus(section.key, i, item) !== "unchanged") && items.length === (defaults[section.key]?.length || 0)

                                return (
                                    <div key={section.key} className="rounded-xl overflow-hidden transition-all duration-200" style={{ border: `1px solid ${section.borderColor}` }}>
                                        {/* Section Header */}
                                        <button
                                            onClick={() => setExpandedIncSections(prev => ({ ...prev, [section.key]: !prev[section.key] }))}
                                            className="w-full flex items-center gap-3 px-5 py-4 transition-colors"
                                            style={{ background: section.bgColor }}
                                        >
                                            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: '#FFFFFF', color: section.color, border: `1px solid ${section.borderColor}` }}>
                                                {section.icon}
                                            </span>
                                            <span className="font-sans text-sm font-bold tracking-wide flex-1 text-left" style={{ color: '#052210' }}>{section.label}</span>
                                            <span className="font-sans text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full" style={{ background: '#FFFFFF', color: isDefault ? '#9ca3af' : section.color, border: `1px solid ${isDefault ? '#e5e7eb' : section.borderColor}` }}>
                                                {items.length} item{items.length !== 1 ? 's' : ''}{editedCount > 0 ? ` · ${editedCount} edited` : isDefault ? ' · default' : ''}
                                            </span>
                                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} style={{ color: section.color }} />
                                        </button>

                                        {/* Expanded Content */}
                                        {isExpanded && (
                                            <div className="px-5 py-4 space-y-2 bg-white">
                                                {/* Reset Button */}
                                                {!isDefault && (
                                                    <div className="flex justify-end mb-2">
                                                        <button
                                                            onClick={() => handleResetSection(section)}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-[10px] font-bold tracking-wider uppercase transition-all hover:bg-gray-100"
                                                            style={{ color: '#6b7280', border: '1px solid #e5e7eb' }}
                                                        >
                                                            <RotateCcw className="w-3 h-3" /> Reset to defaults
                                                        </button>
                                                    </div>
                                                )}

                                                {items.length === 0 && (
                                                    <p className="font-sans text-xs italic py-3 text-center" style={{ color: '#9ca3af' }}>No items. Click "Add" below to get started.</p>
                                                )}

                                                <DragDropContext onDragEnd={(result) => {
                                                    if (!result.destination) return
                                                    if (result.destination.index === result.source.index) return
                                                    handleItemReorder(section, result.source.index, result.destination.index)
                                                }}>
                                                    <Droppable droppableId={`inc-${section.key}`}>
                                                        {(provided) => (
                                                            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                                                                {items.map((item, idx) => {
                                                                    const status = getItemStatus(section.key, idx, item)
                                                                    const rowBg = status === "edited" ? '#E1F5EE' : status === "new" ? '#E6F1FB' : '#FFFFFF'
                                                                    return (
                                                                        <Draggable key={`${section.key}-${idx}`} draggableId={`${section.key}-${idx}`} index={idx}>
                                                                            {(dp, snap) => (
                                                                                <div
                                                                                    ref={dp.innerRef}
                                                                                    {...dp.draggableProps}
                                                                                    className="flex items-center gap-2 group rounded-lg px-3 py-2 transition-colors"
                                                                                    style={{ background: rowBg, border: snap.isDragging ? '1px solid #a7f3d0' : '1px solid #f3f4f6', boxShadow: snap.isDragging ? '0 8px 20px rgba(0,0,0,0.08)' : 'none', ...dp.draggableProps.style }}
                                                                                >
                                                                                    <span {...dp.dragHandleProps} className="flex-shrink-0 cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded hover:bg-gray-100" title="Drag to reorder">
                                                                                        <GripVertical className="w-3.5 h-3.5" style={{ color: '#cbd5e1' }} />
                                                                                    </span>
                                                                                    <span className="font-sans text-[10px] font-bold w-5 text-center flex-shrink-0" style={{ color: '#9ca3af' }}>{idx + 1}</span>
                                                                                    <input
                                                                                        className="flex-1 font-sans text-sm bg-transparent outline-none px-2 py-1"
                                                                                        style={{ color: '#052210' }}
                                                                                        value={item}
                                                                                        onChange={(e) => handleItemEdit(section, idx, e.target.value)}
                                                                                        placeholder={`Enter ${section.label.toLowerCase()} item...`}
                                                                                    />
                                                                                    {status !== "unchanged" && (
                                                                                        <span className="font-sans text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded flex-shrink-0" style={{
                                                                                            background: status === "edited" ? '#d1fae5' : '#dbeafe',
                                                                                            color: status === "edited" ? '#065f46' : '#1e40af',
                                                                                        }}>
                                                                                            {status}
                                                                                        </span>
                                                                                    )}
                                                                                    <button
                                                                                        onClick={() => handleItemDelete(section, idx)}
                                                                                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all flex-shrink-0"
                                                                                    >
                                                                                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </Draggable>
                                                                    )
                                                                })}
                                                                {provided.placeholder}
                                                            </div>
                                                        )}
                                                    </Droppable>
                                                </DragDropContext>

                                                <button
                                                    onClick={() => handleItemAdd(section)}
                                                    className="w-full py-2.5 rounded-lg border-2 border-dashed font-sans text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-gray-50"
                                                    style={{ borderColor: section.borderColor, color: section.color }}
                                                >
                                                    <Plus className="w-3.5 h-3.5" /> Add {section.label.replace(/s$/, '').replace(/ & .*/, '')}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )
                })()}

                {/* STEP 7: Pricing */}
                {step === 7 && (
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#ecfdf5' }}><DollarSign className="w-3.5 h-3.5" style={{ color: '#059669' }} /></div>
                            <div>
                                <h2 className="font-serif text-lg sm:text-xl tracking-wide" style={{ color: '#052210' }}>Pricing</h2>
                                <p className="font-sans text-[11px]" style={{ color: '#9ca3af' }}>Per-plan breakdown — all values update in real time</p>
                            </div>
                        </div>

                        {/* SECTION 1: DMC amount per option — the ONLY input. Margin (by destination
                            profile), GST and TCS are applied automatically. */}
                        {plans.length > 0 && (
                            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
                                <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    <div>
                                        <p className="font-sans text-[11px] font-bold uppercase tracking-widest" style={{ color: '#059669' }}>DMC Cost per Option</p>
                                        <p className="font-sans text-[10px] mt-0.5" style={{ color: '#9ca3af' }}>Enter the DMC quote per option — margin, GST{(plans[0]?.costBreakup?.tcs ?? 0) > 0 ? ' & TCS' : ''} auto-apply</p>
                                    </div>
                                    {plans[0]?.costBreakup?.profileLabel && (
                                        <span className="font-sans text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                                            {plans[0].costBreakup.profileLabel}{destinationName ? ` · ${destinationName}` : ''}
                                        </span>
                                    )}
                                </div>
                                <div className={`grid gap-0 divide-x`} style={{ gridTemplateColumns: `repeat(${plans.length}, minmax(0, 1fr))` }}>
                                    {plans.map((plan, idx) => {
                                        const dmcVal = dmcAmounts[plan.category] ?? 0
                                        return (
                                            <div key={idx} className="p-4 flex flex-col gap-2">
                                                <p className="font-sans text-[10px] font-black uppercase tracking-wider" style={{ color: '#052210' }}>Option {idx + 1}{plan.category && !/^Option /i.test(plan.category) ? `: ${plan.category}` : ''}</p>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-sans text-sm font-bold" style={{ color: '#059669' }}>₹</span>
                                                    <input
                                                        type="number"
                                                        className="w-full pl-7 pr-3 py-2 rounded-lg font-sans text-sm font-bold outline-none"
                                                        style={{ background: '#FFFFFF', border: '1px solid #d1d5db', color: '#052210' }}
                                                        value={dmcVal === 0 ? "" : dmcVal}
                                                        placeholder="DMC amount"
                                                        onChange={e => {
                                                            const val = e.target.value.replace(/^0+/, '')
                                                            const num = val === "" ? 0 : Math.max(0, parseInt(val) || 0)
                                                            setDmcAmounts(prev => ({ ...prev, [plan.category]: num }))
                                                        }}
                                                    />
                                                </div>
                                                {plan.costBreakup?.marginPct != null && dmcVal > 0 && (
                                                    <p className="font-sans text-[9px]" style={{ color: '#9ca3af' }}>Margin {plan.costBreakup.marginPct}% applied</p>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* SECTION 3: Plan Cards with live breakdown */}
                        <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, #a7f3d0, transparent)' }} />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {plans.map((plan, idx) => {
                                const pax = adults + children
                                const displayTotal = plan.totalPrice || 0
                                const eligibleChildrenCount = plan.eligibleChildrenCount ?? 0
                                const displayPerAdult = plan.perAdultPrice || 0
                                const displayPerChild = plan.perChildPrice || 0

                                return (
                                    <div key={idx} className="flex flex-col p-5 rounded-2xl gap-4" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                                        {/* Plan label */}
                                        <div>
                                            <p className="font-sans text-[11px] font-bold tracking-widest uppercase" style={{ color: '#059669' }}>Plan {idx + 1}</p>
                                            <p className="font-serif text-xl font-black uppercase leading-tight" style={{ color: '#052210' }}>{plan.category}</p>
                                        </div>

                                        {/* Breakdown table (DMC → margin → GST → TCS) */}
                                        <div className="rounded-xl overflow-hidden text-[11px] font-sans" style={{ background: '#FFFFFF', border: '1px solid #d1fae5' }}>
                                            <div className="flex justify-between px-3 py-2" style={{ borderBottom: '1px solid #d1fae5' }}>
                                                <span style={{ color: '#6b7280' }}>DMC Cost</span>
                                                <span className="font-bold" style={{ color: '#052210' }}>₹{(plan.costBreakup?.dmc ?? 0).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between px-3 py-2" style={{ borderBottom: '1px solid #d1fae5' }}>
                                                <span style={{ color: '#6b7280' }}>+ Margin ({plan.costBreakup?.marginPct ?? 0}%)</span>
                                                <span className="font-bold" style={{ color: '#059669' }}>₹{(plan.costBreakup?.margin ?? 0).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between px-3 py-2" style={{ borderBottom: '1px solid #d1fae5', background: '#f0fdf4' }}>
                                                <span style={{ color: '#6b7280' }}>Package Value</span>
                                                <span className="font-bold" style={{ color: '#052210' }}>₹{(plan.costBreakup?.packageValue ?? 0).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between px-3 py-2" style={{ borderBottom: '1px solid #d1fae5' }}>
                                                <span style={{ color: '#6b7280' }}>+ GST (5%)</span>
                                                <span className="font-bold" style={{ color: '#059669' }}>₹{(plan.costBreakup?.gst ?? 0).toLocaleString()}</span>
                                            </div>
                                            {(plan.costBreakup?.tcs ?? 0) > 0 && (
                                                <div className="flex justify-between px-3 py-2" style={{ borderBottom: '1px solid #d1fae5' }}>
                                                    <span style={{ color: '#6b7280' }}>+ TCS (2%)</span>
                                                    <span className="font-bold" style={{ color: '#059669' }}>₹{(plan.costBreakup?.tcs ?? 0).toLocaleString()}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Total display */}
                                        <div className="space-y-1.5 pt-1" style={{ borderTop: '2px solid #a7f3d0' }}>
                                            <div className="flex justify-between items-center">
                                                <p className="font-sans text-[11px] font-bold uppercase tracking-wider" style={{ color: '#059669' }}>Grand Total (incl. taxes)</p>
                                                <p className="font-serif text-2xl font-black" style={{ color: '#059669' }}>₹{displayTotal.toLocaleString()}</p>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <p className="font-sans text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6ee7b7' }}>Per Adult ({plan.adultsCount ?? adults} Adult{(plan.adultsCount ?? adults) > 1 ? 's' : ''})</p>
                                                <p className="font-sans text-sm font-bold" style={{ color: '#052210' }}>₹{displayPerAdult.toLocaleString()}</p>
                                            </div>
                                            {(plan.childWithBedCount ?? 0) > 0 && (
                                                <div className="flex justify-between items-center">
                                                    <p className="font-sans text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6ee7b7' }}>Per Child · With Bed ({plan.childWithBedCount})</p>
                                                    <p className="font-sans text-sm font-bold" style={{ color: '#052210' }}>₹{(plan.perChildWithBedPrice ?? 0).toLocaleString()}</p>
                                                </div>
                                            )}
                                            {(plan.childNoBedCount ?? 0) > 0 && (
                                                <div className="flex justify-between items-center">
                                                    <p className="font-sans text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6ee7b7' }}>Per Child · Without Bed ({plan.childNoBedCount})</p>
                                                    <p className="font-sans text-sm font-bold" style={{ color: '#052210' }}>₹{(plan.perChildNoBedPrice ?? 0).toLocaleString()}</p>
                                                </div>
                                            )}
                                            {(plan.infantCount ?? 0) > 0 && (
                                                <div className="flex justify-between items-center">
                                                    <p className="font-sans text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6ee7b7' }}>Infant ({plan.infantCount}, Under 5)</p>
                                                    <p className="font-sans text-sm font-bold" style={{ color: '#059669' }}>{(plan.perInfantPrice ?? 0) > 0 ? `₹${(plan.perInfantPrice ?? 0).toLocaleString()}` : 'Complimentary'}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* STEP 8: Preview */}
                {step === 8 && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#ecfdf5' }}><Eye className="w-3.5 h-3.5" style={{ color: '#059669' }} /></div>
                            <div>
                                <h2 className="font-serif text-lg sm:text-xl tracking-wide" style={{ color: '#052210' }}>Preview & Save</h2>
                                <p className="font-sans text-[11px]" style={{ color: '#9ca3af' }}>Review before saving</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {[
                                { l: "Customer", v: customerName },
                                { l: "Destination", v: destinationName },
                                { l: "Duration", v: `${nights}N / ${totalDays}D` },
                                { l: "Dates", v: `${startDate} → ${endDate}` },
                                { l: "Pax", v: `${adults} Adults${children > 0 ? `, ${children} Children` : ""}` },
                                { l: "Flights", v: flightSegments.length ? flightSegments.map(f => `${f.airline} (${f.fromCode}→${f.toCode})`).join(", ") : "None" },
                                { l: "Hotels", v: selectedHotels.length ? selectedHotels.map((h: any) => {
                                    const roomsCount = h.numberOfRooms !== undefined ? Number(h.numberOfRooms) : 1;
                                    const extraBedsCount = h.numberOfExtraBeds !== undefined ? Number(h.numberOfExtraBeds) : 0;
                                    const roomsStr = `${roomsCount} Room${roomsCount > 1 ? 's' : ''}`;
                                    const extraBedsStr = extraBedsCount > 0 ? `${extraBedsCount} Extra Bed${extraBedsCount > 1 ? 's' : ''}` : '';
                                    
                                    const details = [
                                        h.location,
                                        h.roomType || h.roomCategory,
                                        h.mealPlan ? h.mealPlan.split(' ')[0] : '',
                                        roomsStr,
                                        extraBedsStr,
                                        h.selectedNights ? `${h.selectedNights} Night${h.selectedNights > 1 ? 's' : ''}` : ''
                                    ].filter(Boolean).join(" • ");
                                    return `${h.name || h.hotelName}${details ? ` (${details})` : ""}`;
                                }).join(", ") : "No hotel selected" },
                                { l: "Activities", v: selectedActivities.map((a: any) => a.name || a.activityName).join(", ") || "None" },
                                { l: "Plans", v: plans.filter(p => (p.totalPrice || p.total) > 0).map(p => `${p.planName || p.hotelName} (₹${(p.totalPrice || p.total).toLocaleString()})`).join(" | ") || "None" }
                            ].map(item => (
                                <div key={item.l} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0 px-4 py-3 rounded-xl" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                                    <span className="font-sans text-[11px] font-semibold uppercase tracking-wider sm:w-36 flex-shrink-0" style={{ color: '#059669' }}>{item.l}</span>
                                    <span className="font-sans text-sm font-bold" style={{ color: '#052210' }}>{item.v}</span>
                                </div>
                            ))}
                        </div>

                        {/* External Itinerary Upload Section */}
                        {(mode === "package" || itinModule === "built-package") && (
                            <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50">
                                        <Upload className="w-3.5 h-3.5 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-serif text-base tracking-wide text-[#052210]">External Itinerary Upload</h3>
                                        <p className="font-sans text-[11px] text-gray-400">Upload the manually prepared itinerary file if this package was created outside TMS.</p>
                                    </div>
                                </div>

                                {uploadingExternalItinerary ? (
                                    <div className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
                                        <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                                        <span className="font-sans text-sm text-gray-500 font-medium">Uploading file to storage...</span>
                                    </div>
                                ) : externalItinerary ? (
                                    /* Uploaded file card */
                                    <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-50 text-red-500 font-black font-sans text-[10px] uppercase shrink-0 border border-red-100">
                                                {externalItinerary.type}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-sans text-sm font-semibold text-[#052210] truncate">{externalItinerary.name}</p>
                                                <p className="font-sans text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                                    {(externalItinerary.size / 1024 / 1024).toFixed(2)} MB · Attached Itinerary
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => window.open(externalItinerary.url, '_blank')}
                                                className="px-3 py-1.5 rounded-lg border border-gray-200 font-sans text-xs font-semibold text-gray-600 bg-white hover:bg-gray-50 transition-all shadow-sm"
                                            >
                                                View/Open
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setExternalItinerary(null)}
                                                className="p-1.5 rounded-lg bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 transition-all"
                                                title="Remove file"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* File upload drop area */
                                    <div className="relative group border-2 border-dashed border-gray-200 hover:border-emerald-500 rounded-2xl p-6 transition-all duration-150 bg-gray-50/30 flex flex-col items-center justify-center text-center cursor-pointer">
                                        <input
                                            type="file"
                                            accept=".pdf,.doc,.docx"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0]
                                                if (!file) return
                                                
                                                const ext = file.name.split('.').pop()?.toLowerCase() || ''
                                                if (!['pdf', 'doc', 'docx'].includes(ext)) {
                                                    toast({
                                                        title: "Invalid File Type",
                                                        description: "Only PDF, DOC, and DOCX files are allowed.",
                                                        variant: "destructive"
                                                    })
                                                    return
                                                }
                                                await handleExternalItineraryUpload(file)
                                            }}
                                        />
                                        <Upload className="w-8 h-8 text-gray-300 group-hover:text-emerald-500 mb-2.5 transition-colors" />
                                        <p className="font-sans text-sm font-semibold text-[#052210]">Click or Drag file to upload</p>
                                        <p className="font-sans text-[10px] text-gray-400 mt-1">Supported formats: PDF, DOC, DOCX (Max 1 file)</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Desktop Navigation */}
            <div className="hidden sm:flex items-center justify-between">
                <button
                    onClick={() => setStep(Math.max(0, step - 1))}
                    disabled={step === 0}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl font-sans text-xs font-semibold tracking-wider uppercase disabled:opacity-20 transition-all hover:bg-gray-50"
                    style={{ color: '#059669', border: '1px solid #d1d5db' }}
                >
                    <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                {step < STEPS.length - 1 ? (
                    <button
                        onClick={goToNextStep}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-sans text-xs font-semibold tracking-wider uppercase transition-all hover:opacity-90"
                        style={{ background: '#059669', color: '#FFFFFF' }}
                    >
                        Next <ChevronRight className="w-4 h-4" />
                    </button>
                ) : (
                    <button
                        onClick={() => handleSave()}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-sans text-xs font-semibold tracking-wider uppercase transition-all hover:opacity-90 disabled:opacity-50"
                        style={{ background: '#059669', color: '#FFFFFF' }}
                    >
                        {saving ? "Saving..." : "Save Itinerary"} <Check className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Mobile Fixed Bottom Navigation */}
            <div className="flex sm:hidden items-center justify-between fixed bottom-0 left-0 right-0 p-3 z-50" style={{ background: '#FFFFFF', borderTop: '1px solid #e5e7eb', boxShadow: '0 -2px 10px rgba(0,0,0,0.05)' }}>
                <button
                    onClick={() => setStep(Math.max(0, step - 1))}
                    disabled={step === 0}
                    className="flex items-center gap-1.5 px-4 py-3 rounded-xl font-sans text-xs font-semibold tracking-wider uppercase disabled:opacity-20 transition-all"
                    style={{ color: '#059669', border: '1px solid #d1d5db' }}
                >
                    <ChevronLeft className="w-4 h-4" /> Back
                </button>
                {step < STEPS.length - 1 ? (
                    <button
                        onClick={goToNextStep}
                        className="flex items-center gap-1.5 px-5 py-3 rounded-xl font-sans text-xs font-semibold tracking-wider uppercase transition-all"
                        style={{ background: '#059669', color: '#FFFFFF' }}
                    >
                        Next <ChevronRight className="w-4 h-4" />
                    </button>
                ) : (
                    <button
                        onClick={() => handleSave()}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-5 py-3 rounded-xl font-sans text-xs font-semibold tracking-wider uppercase transition-all disabled:opacity-50"
                        style={{ background: '#059669', color: '#FFFFFF' }}
                    >
                        {saving ? "Saving..." : "Save"} <Check className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Save-time validation dialog — lists incomplete mandatory fields with a jump action */}
            {validationModal.open && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setValidationModal({ open: false, missing: [] })}>
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                            </div>
                            <h3 className="font-serif text-lg tracking-wide" style={{ color: '#052210' }}>Cannot Save Itinerary</h3>
                        </div>
                        <p className="font-sans text-sm text-gray-500 mb-3">The following mandatory fields are incomplete:</p>
                        <ul className="space-y-2 mb-5">
                            {validationModal.missing.map(m => (
                                <li key={m.fieldId} className="flex items-center gap-2.5 font-sans text-sm font-semibold" style={{ color: '#052210' }}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                                    {m.label}
                                </li>
                            ))}
                        </ul>
                        <p className="font-sans text-xs text-gray-400 mb-4">Complete these fields to finish — or save now as a draft and return to it later.</p>
                        <button
                            onClick={() => { setValidationModal({ open: false, missing: [] }); handleSave(true) }}
                            className="w-full mb-3 px-4 py-3 rounded-xl font-sans text-xs font-bold tracking-wider uppercase transition-all hover:opacity-90"
                            style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}
                        >
                            Save as Draft (mark "Not Completed")
                        </button>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setValidationModal({ open: false, missing: [] })}
                                className="flex-1 px-4 py-3 rounded-xl font-sans text-xs font-bold tracking-wider uppercase transition-all hover:bg-gray-50"
                                style={{ border: '1px solid #d1d5db', color: '#6b7280' }}
                            >
                                Close
                            </button>
                            <button
                                onClick={() => {
                                    const first = validationModal.missing[0]
                                    setValidationModal({ open: false, missing: [] })
                                    setStep(0)
                                    if (first) scrollToField(first.fieldId)
                                }}
                                className="flex-1 px-4 py-3 rounded-xl font-sans text-xs font-bold tracking-wider uppercase transition-all hover:opacity-90"
                                style={{ background: '#052210', color: '#FFFFFF' }}
                            >
                                Go to First Missing Field
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
