"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { CheckCircle, Circle, FileText, ChevronRight, ChevronLeft, X, Calendar as CalendarIcon, UploadCloud, File, AlertCircle, Briefcase, CreditCard, Check, Folder, Plus } from "lucide-react"
import { useDialog } from "@/components/dialog-provider"
import { FilePreview } from "@/components/file-preview"

// Custom, Premium, green-themed Date Picker
function CustomDatePicker({ value, onChange }: { value: string; onChange: (val: string) => void }) {
    const [isOpen, setIsOpen] = useState(false);
    
    // Parse initial date
    const initialDate = useMemo(() => {
        if (!value) return new Date();
        const parts = value.split("-");
        if (parts.length === 3 && parts[0].length === 4) {
            return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        }
        return new Date();
    }, [value]);

    const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth());
    const [currentYear, setCurrentYear] = useState(initialDate.getFullYear());
    // Calendar view: day grid, month picker, or year picker.
    const [view, setView] = useState<"days" | "months" | "years">("days");
    const [yearRangeStart, setYearRangeStart] = useState(initialDate.getFullYear() - 6);

    // Sync month/year when initialDate changes
    useEffect(() => {
        if (value) {
            const parts = value.split("-");
            if (parts.length === 3 && parts[0].length === 4) {
                setCurrentMonth(Number(parts[1]) - 1);
                setCurrentYear(Number(parts[0]));
            }
        }
    }, [value]);

    // Header prev/next: meaning depends on the active view.
    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (view === "years") { setYearRangeStart(prev => prev - 12); return; }
        if (view === "months") { setCurrentYear(prev => prev - 1); return; }
        if (currentMonth === 0) {
            setCurrentMonth(11);
            setCurrentYear(prev => prev - 1);
        } else {
            setCurrentMonth(prev => prev - 1);
        }
    };

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (view === "years") { setYearRangeStart(prev => prev + 12); return; }
        if (view === "months") { setCurrentYear(prev => prev + 1); return; }
        if (currentMonth === 11) {
            setCurrentMonth(0);
            setCurrentYear(prev => prev + 1);
        } else {
            setCurrentMonth(prev => prev + 1);
        }
    };

    const openYearView = (e: React.MouseEvent) => {
        e.stopPropagation();
        setYearRangeStart(currentYear - 6);
        setView("years");
    };

    const handleSelectDay = (day: number) => {
        const yyyy = currentYear;
        const mm = String(currentMonth + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        onChange(`${yyyy}-${mm}-${dd}`);
        setIsOpen(false);
    };

    // Date calculations
    const daysCount = useMemo(() => new Date(currentYear, currentMonth + 1, 0).getDate(), [currentMonth, currentYear]);
    const firstDay = useMemo(() => new Date(currentYear, currentMonth, 1).getDay(), [currentMonth, currentYear]);

    const monthNames = [
        "January", "February", "March", "April", "May", "June", 
        "July", "August", "September", "October", "November", "December"
    ];

    const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

    // Format display date: DD-MM-YYYY
    const displayValue = useMemo(() => {
        if (!value) return "";
        const parts = value.split("-");
        if (parts.length === 3 && parts[0].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return value;
    }, [value]);

    const today = new Date();
    const isToday = (day: number) => {
        return today.getDate() === day && 
               today.getMonth() === currentMonth && 
               today.getFullYear() === currentYear;
    };

    const isSelected = (day: number) => {
        if (!value) return false;
        const parts = value.split("-");
        if (parts.length === 3 && parts[0].length === 4) {
            return Number(parts[2]) === day && 
                   Number(parts[1]) - 1 === currentMonth && 
                   Number(parts[0]) === currentYear;
        }
        return false;
    };

    // Close on click outside
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setView("days");
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className="relative w-full" style={{ zIndex: isOpen ? 9999 : 1 }}>
            {/* Input trigger */}
            <button
                type="button"
                onClick={() => { setIsOpen(prev => !prev); setView("days"); }}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 bg-white font-sans text-sm text-left text-[#0d3d2b] hover:border-gray-300 focus:ring-2 focus:ring-[#1D9E75]/10 focus:border-[#1D9E75] outline-none transition-all cursor-pointer shadow-sm relative flex items-center justify-between"
            >
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                    <CalendarIcon className="w-4 h-4 text-gray-400" />
                </div>
                <span className={displayValue ? "font-bold text-[#0d3d2b]" : "text-gray-400"}>
                    {displayValue || "Select date (DD-MM-YYYY)..."}
                </span>
            </button>

            {/* Calendar Popover */}
            {isOpen && (
                <div 
                    className="absolute top-[calc(100%+8px)] left-0 z-[9999] w-[300px] p-4 rounded-2xl border border-gray-200 shadow-2xl bg-white opacity-100 isolate my-solid-calendar"
                    style={{ backgroundColor: '#ffffff', opacity: 1, zIndex: 9999 }}
                >
                    <style dangerouslySetInnerHTML={{__html: `
                        .my-solid-calendar {
                            background: #ffffff !important;
                            background-color: #ffffff !important;
                            opacity: 1.0 !important;
                            z-index: 99999 !important;
                        }
                        .my-solid-calendar * {
                            opacity: 1.0 !important;
                        }
                    `}} />
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4 bg-white" style={{ backgroundColor: '#ffffff', opacity: 1 }}>
                        <button
                            type="button"
                            onClick={handlePrev}
                            className="p-1.5 hover:bg-gray-50 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-1">
                            {view === "days" && (
                                <>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setView("months"); }} className="font-sans text-xs font-bold text-[#0d3d2b] px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors">
                                        {monthNames[currentMonth]}
                                    </button>
                                    <button type="button" onClick={openYearView} className="font-sans text-xs font-bold text-[#0d3d2b] px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors">
                                        {currentYear}
                                    </button>
                                </>
                            )}
                            {view === "months" && (
                                <button type="button" onClick={openYearView} className="font-sans text-xs font-bold text-[#0d3d2b] px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors">
                                    {currentYear}
                                </button>
                            )}
                            {view === "years" && (
                                <span className="font-sans text-xs font-bold text-[#0d3d2b]">
                                    {yearRangeStart} – {yearRangeStart + 11}
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={handleNext}
                            className="p-1.5 hover:bg-gray-50 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Day grid view */}
                    {view === "days" && (
                    <>
                    {/* Weekdays header */}
                    <div className="grid grid-cols-7 gap-1 text-center mb-1 bg-white" style={{ backgroundColor: '#ffffff', opacity: 1 }}>
                        {weekdays.map(d => (
                            <span key={d} className="font-sans text-[10px] font-bold text-gray-400 uppercase">
                                {d}
                            </span>
                        ))}
                    </div>

                    {/* Days grid */}
                    <div className="grid grid-cols-7 gap-1 text-center bg-white" style={{ backgroundColor: '#ffffff', opacity: 1 }}>
                        {/* Empty padding days for first week */}
                        {Array.from({ length: firstDay }).map((_, i) => (
                            <div key={`empty-${i}`} className="aspect-square bg-white" style={{ backgroundColor: '#ffffff', opacity: 1 }} />
                        ))}
                        {/* Month days */}
                        {Array.from({ length: daysCount }).map((_, i) => {
                            const dayNum = i + 1;
                            const selected = isSelected(dayNum);
                            const todayDay = isToday(dayNum);
                            return (
                                <button
                                    key={`day-${dayNum}`}
                                    type="button"
                                    onClick={() => handleSelectDay(dayNum)}
                                    className={`aspect-square w-full rounded-lg font-sans text-xs font-semibold flex items-center justify-center transition-all ${
                                        selected
                                            ? "bg-[#1D9E75] text-white shadow-md shadow-[#1D9E75]/20 scale-105"
                                            : todayDay
                                            ? "bg-[#1D9E75]/10 text-[#1D9E75] border border-[#1D9E75]/30 hover:bg-[#1D9E75]/20"
                                            : "text-[#0d3d2b] hover:bg-gray-50 active:scale-95"
                                    }`}
                                    style={{ opacity: 1 }}
                                >
                                    {dayNum}
                                </button>
                            );
                        })}
                    </div>
                    </>
                    )}

                    {/* Month picker view */}
                    {view === "months" && (
                        <div className="grid grid-cols-3 gap-2 bg-white" style={{ backgroundColor: '#ffffff', opacity: 1 }}>
                            {monthNames.map((m, i) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setCurrentMonth(i); setView("days"); }}
                                    className={`py-2.5 rounded-lg font-sans text-xs font-semibold transition-all ${
                                        i === currentMonth ? "bg-[#1D9E75] text-white shadow-md shadow-[#1D9E75]/20" : "text-[#0d3d2b] hover:bg-gray-50"
                                    }`}
                                >
                                    {m.slice(0, 3)}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Year picker view */}
                    {view === "years" && (
                        <div className="grid grid-cols-3 gap-2 bg-white" style={{ backgroundColor: '#ffffff', opacity: 1 }}>
                            {Array.from({ length: 12 }).map((_, i) => {
                                const yr = yearRangeStart + i;
                                return (
                                    <button
                                        key={yr}
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setCurrentYear(yr); setView("days"); }}
                                        className={`py-2.5 rounded-lg font-sans text-xs font-semibold transition-all ${
                                            yr === currentYear ? "bg-[#1D9E75] text-white shadow-md shadow-[#1D9E75]/20" : "text-[#0d3d2b] hover:bg-gray-50"
                                        }`}
                                    >
                                        {yr}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Actions: Clear & Today */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 bg-white" style={{ backgroundColor: '#ffffff', opacity: 1 }}>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange("");
                                setIsOpen(false);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                            Clear
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                const yyyy = today.getFullYear();
                                const mm = String(today.getMonth() + 1).padStart(2, '0');
                                const dd = String(today.getDate()).padStart(2, '0');
                                onChange(`${yyyy}-${mm}-${dd}`);
                                setIsOpen(false);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#1D9E75] hover:bg-[#1D9E75]/10 transition-colors cursor-pointer"
                        >
                            Today
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

const CATEGORY_KEYS = {
    BOOKING_INFO: "booking_info",
    VENDOR_DETAILS: "vendor_details",
    DOCS_REQUIREMENTS: "docs_requirements",
    PAYMENT_INFO: "payment_info"
} as const;

const CATEGORY_CONFIG = {
    [CATEGORY_KEYS.BOOKING_INFO]: {
        title: "Booking Information",
        icon: CalendarIcon,
        color: "from-emerald-500 to-teal-600",
        bg: "bg-emerald-50/50",
        border: "border-emerald-100",
        text: "text-emerald-700",
        items: [
            "booking closing date",
            "client nationality",
            "early check-in request",
            "early checkin request",
            "hotel check-in date",
            "hotel checkin date",
            "hotel check-out date",
            "hotel checkout date",
            "hotel name",
            "number of adults",
            "number of kids",
            "kids ages",
            "number of rooms",
            "number of extra beds",
            "number of extra beds / cwb",
            "special requests"
        ]
    },
    [CATEGORY_KEYS.VENDOR_DETAILS]: {
        title: "Vendor Details",
        icon: Briefcase,
        color: "from-blue-500 to-indigo-600",
        bg: "bg-blue-50/50",
        border: "border-blue-100",
        text: "text-blue-700",
        items: [
            "dmc name",
            "dmc contact person",
            "dmc contact number",
            "flight / train ticket pdf",
            "flight / train ticket",
            "flight ticket",
            "train ticket",
            "dmc quote pdf",
            "dmc quote"
        ]
    },
    [CATEGORY_KEYS.DOCS_REQUIREMENTS]: {
        title: "Documents & Requirements",
        icon: FileText,
        color: "from-purple-500 to-pink-600",
        bg: "bg-purple-50/50",
        border: "border-purple-100",
        text: "text-purple-700",
        items: [
            "visa required",
            "visa cost included",
            "passport document",
            "passport expiry date",
            "passport expiry",
            "travel insurance documents",
            "travel insurance"
        ]
    },
    [CATEGORY_KEYS.PAYMENT_INFO]: {
        title: "Payment Information",
        icon: CreditCard,
        color: "from-amber-500 to-orange-600",
        bg: "bg-amber-50/50",
        border: "border-amber-100",
        text: "text-amber-700",
        items: [
            "total package cost",
            "dmc cost",
            "dmc payment confirmed",
            "remaining payment status",
            "handover comments",
            "invoice pdf",
            "invoice"
        ]
    }
};

function getCategory(name: string): keyof typeof CATEGORY_CONFIG {
    const lowerName = name.toLowerCase().trim();
    
    // 1. Direct match check
    for (const [catKey, cat] of Object.entries(CATEGORY_CONFIG)) {
        if (cat.items.some(item => lowerName.includes(item) || item.includes(lowerName))) {
            return catKey as keyof typeof CATEGORY_CONFIG;
        }
    }
    
    // 2. Keyword fallback check
    if (lowerName.includes("booking") || lowerName.includes("date") || lowerName.includes("guest") || lowerName.includes("adult") || lowerName.includes("kid") || lowerName.includes("room") || lowerName.includes("request") || lowerName.includes("nationality")) {
        return CATEGORY_KEYS.BOOKING_INFO;
    }
    if (lowerName.includes("dmc") || lowerName.includes("vendor") || lowerName.includes("ticket") || lowerName.includes("flight") || lowerName.includes("train")) {
        return CATEGORY_KEYS.VENDOR_DETAILS;
    }
    if (lowerName.includes("visa") || lowerName.includes("passport") || lowerName.includes("insurance") || lowerName.includes("document") || lowerName.includes("requirement")) {
        return CATEGORY_KEYS.DOCS_REQUIREMENTS;
    }
    if (lowerName.includes("payment") || lowerName.includes("cost") || lowerName.includes("price") || lowerName.includes("invoice") || lowerName.includes("comment")) {
        return CATEGORY_KEYS.PAYMENT_INFO;
    }

    return CATEGORY_KEYS.BOOKING_INFO; // default fallback
}

// ─── Dynamic category support ───────────────────────────────────────────────
// Admin-defined categories (set in the SOP Builder) are carried onto each checklist
// item as `item.category` (the category name). We honor that when present; otherwise we
// fall back to the legacy keyword-based getCategory() so untagged/legacy items keep working.

// Lookup from a built-in category title (lowercased) to its config key, so a dynamic
// category whose name matches a built-in (e.g. "Booking Information") reuses its styling
// and merges with any legacy items in the same category instead of creating a duplicate tab.
const TITLE_TO_KEY: Record<string, string> = Object.entries(CATEGORY_CONFIG).reduce((acc, [key, cfg]) => {
    acc[cfg.title.toLowerCase()] = key;
    return acc;
}, {} as Record<string, string>);

// Styling palette for purely custom categories that have no built-in config entry.
const DYNAMIC_STYLES = [
    { icon: Folder, color: "from-emerald-500 to-teal-600", bg: "bg-emerald-50/50", border: "border-emerald-100", text: "text-emerald-700" },
    { icon: Folder, color: "from-blue-500 to-indigo-600", bg: "bg-blue-50/50", border: "border-blue-100", text: "text-blue-700" },
    { icon: Folder, color: "from-purple-500 to-pink-600", bg: "bg-purple-50/50", border: "border-purple-100", text: "text-purple-700" },
    { icon: Folder, color: "from-amber-500 to-orange-600", bg: "bg-amber-50/50", border: "border-amber-100", text: "text-amber-700" },
    { icon: Folder, color: "from-rose-500 to-red-600", bg: "bg-rose-50/50", border: "border-rose-100", text: "text-rose-700" },
    { icon: Folder, color: "from-cyan-500 to-sky-600", bg: "bg-cyan-50/50", border: "border-cyan-100", text: "text-cyan-700" },
];

// Resolve the effective category for a checklist item.
// Returns a stable grouping key, a display title, and (when applicable) the built-in
// config key whose styling should be reused.
function resolveCategory(item: any): { key: string; title: string; configKey: string | null } {
    const stored = (item?.category || "").toString().trim();
    if (stored) {
        const canonical = TITLE_TO_KEY[stored.toLowerCase()];
        if (canonical) return { key: canonical, title: CATEGORY_CONFIG[canonical as keyof typeof CATEGORY_CONFIG].title, configKey: canonical };
        return { key: `dyn::${stored}`, title: stored, configKey: null };
    }
    const legacyKey = getCategory(item?.name || item?.title || "");
    return { key: legacyKey, title: CATEGORY_CONFIG[legacyKey].title, configKey: legacyKey };
}

interface SalesChecklistModalProps {
    isOpen: boolean
    onClose: () => void
    checklist: any[]
    onToggleItem: (id: string, checked: boolean) => Promise<void>
    onUpdateItem: (id: string, data: any) => Promise<void>
    onFileUpload: (id: string, files: File[]) => Promise<void>
    uploadingItemId: string | null
    onComplete: () => void
    // Trip dates (ISO YYYY-MM-DD) used to pre-fill the hotel check-in / check-out items.
    tripStartDate?: string
    tripEndDate?: string
}

export default function SalesChecklistModal({
    isOpen,
    onClose,
    checklist,
    onToggleItem,
    onUpdateItem,
    onFileUpload,
    uploadingItemId,
    onComplete,
    tripStartDate,
    tripEndDate
}: SalesChecklistModalProps) {
    const requiredChecklist = useMemo(() => checklist.filter(c => c.isRequired !== false), [checklist]);
    const completedCount = useMemo(() => requiredChecklist.filter(c => c.checked).length, [requiredChecklist]);
    const isAllDone = useMemo(() => completedCount === requiredChecklist.length && requiredChecklist.length > 0, [completedCount, requiredChecklist.length]);

    // Refs + state for guiding the user to the first missed mandatory field
    const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const highlightTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const registerItemRef = useCallback((id: string, el: HTMLDivElement | null) => {
        itemRefs.current[id] = el;
    }, []);

    useEffect(() => {
        return () => { if (highlightTimeout.current) clearTimeout(highlightTimeout.current); };
    }, []);

    // Auto-fill Hotel Check-in date from the trip start date and Hotel Check-out date from
    // the trip end date — but only when the field is still empty, so any manual edit is kept.
    const autoFilledRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (!tripStartDate && !tripEndDate) return;
        checklist.forEach((item: any) => {
            if (!item?.id || autoFilledRef.current.has(item.id)) return;
            const norm = (item.name || item.title || "").toLowerCase().replace(/[\s_-]/g, "");
            const isDateItem = (item.type || "").toLowerCase().includes("date") || norm.includes("date");
            if (!isDateItem) return;
            const hasResponse = !!(item.response && String(item.response).trim());
            if (hasResponse) return;
            if (norm.includes("checkin") && tripStartDate) {
                autoFilledRef.current.add(item.id);
                onUpdateItem(item.id, { response: tripStartDate });
            } else if (norm.includes("checkout") && tripEndDate) {
                autoFilledRef.current.add(item.id);
                onUpdateItem(item.id, { response: tripEndDate });
            }
        });
    }, [checklist, tripStartDate, tripEndDate, onUpdateItem]);

    // Grouping & category state. Honors admin-defined categories (item.category) when
    // present, falling back to legacy keyword grouping for untagged/legacy items. Category
    // display order follows the lowest item `order` within each group, which reflects the
    // layout configured in the SOP Builder.
    const activeCategoriesList = useMemo(() => {
        const groups = new Map<string, { key: string; title: string; configKey: string | null; catOrder: number; minOrder: number; items: any[] }>();
        checklist.forEach((item, idx) => {
            const { key, title, configKey } = resolveCategory(item);
            const ord = typeof item.order === "number" ? item.order : idx;
            const catOrder = typeof item.categoryOrder === "number" ? item.categoryOrder : 9999;
            const g = groups.get(key);
            if (g) {
                g.items.push(item);
                if (ord < g.minOrder) g.minOrder = ord;
                if (catOrder < g.catOrder) g.catOrder = catOrder;
            } else {
                groups.set(key, { key, title, configKey, catOrder, minOrder: ord, items: [item] });
            }
        });

        // Order tabs by the admin-defined category order, then by item order, then name.
        const ordered = Array.from(groups.values()).sort((a, b) => a.catOrder - b.catOrder || a.minOrder - b.minOrder || a.title.localeCompare(b.title));

        return ordered.map((g, idx) => {
            const cfg = g.configKey ? CATEGORY_CONFIG[g.configKey as keyof typeof CATEGORY_CONFIG] : null;
            const style = cfg || DYNAMIC_STYLES[idx % DYNAMIC_STYLES.length];
            const required = g.items.filter(c => c.isRequired !== false);
            const completedRequired = required.filter(c => c.checked).length;
            const totalCompleted = g.items.filter(c => c.checked).length;
            const isDone = required.length > 0 ? completedRequired === required.length : true;

            return {
                id: g.key,
                title: g.title,
                icon: style.icon,
                color: style.color,
                bg: style.bg,
                border: style.border,
                text: style.text,
                itemsCount: g.items.length,
                requiredCount: required.length,
                completedRequired,
                totalCompleted,
                isDone,
                items: g.items
            };
        });
    }, [checklist]);

    const [activeCategory, setActiveCategory] = useState<string>("booking_info");

    useEffect(() => {
        if (activeCategoriesList.length > 0 && !activeCategoriesList.some(c => c.id === activeCategory)) {
            setActiveCategory(activeCategoriesList[0].id);
        }
    }, [activeCategoriesList, activeCategory]);

    const handleFooterClick = useCallback(() => {
        if (isAllDone) { onComplete(); return; }
        // Find the first incomplete mandatory item in display order
        const firstPending = checklist.find(c => c.isRequired !== false && !c.checked);
        if (!firstPending) { onComplete(); return; }

        const catId = resolveCategory(firstPending).key;
        setActiveCategory(catId);

        setTimeout(() => {
            const el = itemRefs.current[firstPending.id];
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            setHighlightedId(firstPending.id);
            if (highlightTimeout.current) clearTimeout(highlightTimeout.current);
            highlightTimeout.current = setTimeout(() => setHighlightedId(null), 5000);
        }, 100);
    }, [isAllDone, checklist, onComplete]);

    // Per-category navigation. Non-final categories show a "Next" button that validates the
    // current category's mandatory items before advancing; only the final category shows the
    // "Ready for Handover" action.
    const currentCategoryIndex = activeCategoriesList.findIndex(c => c.id === activeCategory);
    const isLastCategory = activeCategoriesList.length === 0 || currentCategoryIndex === activeCategoriesList.length - 1;

    const handleNextCategory = () => {
        const currentCategory = activeCategoriesList[currentCategoryIndex];
        if (!currentCategory) return;
        // Validate this category's mandatory items first.
        const firstPendingInCat = currentCategory.items.find((c: any) => c.isRequired !== false && !c.checked);
        if (firstPendingInCat) {
            setTimeout(() => {
                const el = itemRefs.current[firstPendingInCat.id];
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                setHighlightedId(firstPendingInCat.id);
                if (highlightTimeout.current) clearTimeout(highlightTimeout.current);
                highlightTimeout.current = setTimeout(() => setHighlightedId(null), 5000);
            }, 50);
            return;
        }
        const next = activeCategoriesList[currentCategoryIndex + 1];
        if (next) setActiveCategory(next.id);
    };

    if (!isOpen) return null;

    // Step-nav geometry: align the connector line with the circle centres (flex-1 columns).
    const navCount = activeCategoriesList.length;
    const navEdge = navCount > 0 ? 50 / navCount : 0;
    const overallPct = requiredChecklist.length > 0 ? (completedCount / requiredChecklist.length) * 100 : 0;

    return (
        <div className="w-full h-full bg-white flex flex-col animate-in fade-in duration-500 -m-4 sm:-m-6 md:-m-8">
            {/* Header (Fixed) */}
            <header className="px-8 py-8 shrink-0 bg-[#0d3d2b] relative overflow-hidden">
                    <div className="flex items-center justify-between relative z-10">
                        <div>
                            <h2 className="font-serif text-2xl text-white tracking-wide">Sales Pre-Handover Checklist</h2>
                            <p className="font-sans text-[10px] text-[#1D9E75] uppercase tracking-[0.2em] font-black mt-1">
                                {completedCount} / {requiredChecklist.length} MANDATORY COMPLETED
                            </p>
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-2.5 hover:bg-white/10 rounded-full transition-all group border border-white/10"
                        >
                            <X className="w-5 h-5 text-white/70 group-hover:text-white group-hover:rotate-90 transition-all duration-300" />
                        </button>
                    </div>
                    {/* Progress bar in header */}
                    <div className="mt-6 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-[#1D9E75] transition-all duration-700 ease-out shadow-[0_0_8px_#1D9E75]"
                            style={{ width: `${(completedCount / requiredChecklist.length) * 100}%` }}
                        />
                    </div>
                </header>

                {/* Scrollable Body */}
                <div 
                    className="flex-1 overflow-y-auto bg-[#fafafa] px-8 py-10 scrollbar-hide"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {/* Category Navigation — connected step-nav style (matches Build Package screen) */}
                    <div className="mb-8 p-4 rounded-2xl bg-white border border-gray-200/70 shadow-sm">
                        <div className="flex items-start justify-between relative gap-1">
                            {/* Connector line (track + progress fill), aligned to circle centres */}
                            {navCount > 1 && (
                                <>
                                    <div className="absolute top-4 h-0.5 bg-gray-200" style={{ left: `${navEdge}%`, right: `${navEdge}%` }} />
                                    <div className="absolute top-4 h-0.5 bg-[#1D9E75] transition-all duration-500" style={{ left: `${navEdge}%`, width: `${((100 - 2 * navEdge) * overallPct) / 100}%` }} />
                                </>
                            )}

                            {activeCategoriesList.map((cat) => {
                                const IconComponent = cat.icon;
                                const isActive = activeCategory === cat.id;

                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setActiveCategory(cat.id)}
                                        title={cat.title}
                                        aria-pressed={isActive}
                                        className="relative z-10 flex flex-1 min-w-0 flex-col items-center gap-1.5 group cursor-pointer"
                                    >
                                        <div
                                            className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-all duration-300 border-2"
                                            style={{
                                                background: cat.isDone ? '#1D9E75' : '#FFFFFF',
                                                borderColor: cat.isDone ? '#1D9E75' : (isActive ? '#1D9E75' : '#d1d5db'),
                                                color: cat.isDone ? '#FFFFFF' : (isActive ? '#1D9E75' : '#9ca3af'),
                                                boxShadow: isActive ? '0 0 0 4px rgba(29,158,117,0.15)' : 'none',
                                            }}
                                        >
                                            {cat.isDone ? <Check className="w-3.5 h-3.5" /> : <IconComponent className="w-3.5 h-3.5" />}
                                        </div>
                                        <span
                                            className="font-sans text-[10px] font-semibold tracking-wider leading-tight text-center break-words"
                                            style={{ color: isActive ? '#1D9E75' : (cat.isDone ? '#052210' : '#9ca3af') }}
                                        >
                                            {cat.title}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Active Tab Items — responsive two-column grid (single column on mobile) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mb-12 items-start">
                        {activeCategoriesList
                            .find(c => c.id === activeCategory)
                            ?.items.map((item) => (
                                <MemoizedChecklistItem
                                    key={item.id}
                                    item={item}
                                    onToggleItem={onToggleItem}
                                    onUpdateItem={onUpdateItem}
                                    onFileUpload={onFileUpload}
                                    uploadingItemId={uploadingItemId}
                                    isHighlighted={highlightedId === item.id}
                                    registerItemRef={registerItemRef}
                                />
                            ))
                        }
                    </div>

                    {/* Footer (Non-sticky, compact) */}
                    <footer className="mt-10 pt-6 border-t border-gray-200 bg-white px-5 py-4">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-sans text-sm font-semibold text-[#0d3d2b] leading-tight">{isLastCategory ? "Ready for Handover?" : "Continue to Next Section"}</h3>
                                    <p className="font-sans text-[11px] text-gray-400 uppercase tracking-wider mt-0.5">{isLastCategory ? "MANDATORY ITEMS MUST BE CHECKED" : "COMPLETE THIS SECTION'S MANDATORY FIELDS"}</p>
                                </div>
                                <div className="text-right">
                                    <span className="font-sans text-[11px] font-bold text-[#1D9E75] bg-[#1D9E75]/10 px-2 py-0.5 rounded">
                                        {completedCount} / {requiredChecklist.length} COMPLETED
                                    </span>
                                </div>
                            </div>

                            {isLastCategory ? (
                                <>
                                    <button
                                        onClick={handleFooterClick}
                                        className={`w-full h-10 rounded-lg font-sans text-[12px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                            isAllDone
                                            ? "bg-[#0d3d2b] text-[#1D9E75] hover:bg-[#0d3d2b]/90 active:scale-[0.98]"
                                            : "bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 active:scale-[0.98]"
                                        }`}
                                    >
                                        {isAllDone ? "PROCEED TO HANDOVER" : "SHOW PENDING FIELD"} <ChevronRight className="w-4 h-4" />
                                    </button>
                                    {!isAllDone && (
                                        <p className="font-sans text-[11px] text-amber-600 text-center -mt-1 flex items-center justify-center gap-1.5">
                                            <AlertCircle className="w-3 h-3" />
                                            {requiredChecklist.length - completedCount} mandatory field(s) remaining — tap above to jump to the next one.
                                        </p>
                                    )}
                                </>
                            ) : (
                                <button
                                    onClick={handleNextCategory}
                                    className="w-full h-10 rounded-lg font-sans text-[12px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer bg-[#1D9E75] text-white hover:bg-[#1a8c68] active:scale-[0.98]"
                                >
                                    NEXT <ChevronRight className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </footer>
                </div>
        </div>
    )
}

const MemoizedChecklistItem = React.memo(({ item, onToggleItem, onUpdateItem, onFileUpload, uploadingItemId, isHighlighted, registerItemRef }: any) => {
    const isMandatory = item.isRequired !== false;
    const { showDialog } = useDialog();
    const [localPreviews, setLocalPreviews] = useState<{ [fileName: string]: string }>({});

    const currentUrls = useMemo(() => {
        return item.fileUrl ? item.fileUrl.split(',').filter(Boolean) : [];
    }, [item.fileUrl]);

    const getFilenameFromUrl = (url: string) => {
        try {
            const decoded = decodeURIComponent(url);
            const parts = decoded.split('/');
            return parts[parts.length - 1] || "Document";
        } catch (e) {
            return "Document";
        }
    };

    const handleDeleteFile = useCallback((urlToDelete: string) => {
        const filename = getFilenameFromUrl(urlToDelete);
        setLocalPreviews(prev => {
            if (prev[filename]) {
                try {
                    URL.revokeObjectURL(prev[filename]);
                } catch (e) {}
                const copy = { ...prev };
                delete copy[filename];
                return copy;
            }
            return prev;
        });
        const updatedUrls = currentUrls.filter((u: string) => u !== urlToDelete);
        onUpdateItem(item.id, { fileUrl: updatedUrls.join(',') });
    }, [currentUrls, item.id, onUpdateItem]);

    const handleFileClick = (e: React.MouseEvent, url: string, filename: string) => {
        e.preventDefault();
        e.stopPropagation();
        const previewUrl = localPreviews[filename] || url;
        window.open(previewUrl, '_blank');
    };
    
    return (
        <div
            ref={(el) => registerItemRef?.(item.id, el)}
            className={`relative group scroll-mt-6 rounded-2xl border p-5 transition-all duration-300 ${
                isHighlighted
                    ? "ring-2 ring-red-400 border-red-300 bg-red-50/40 shadow-sm"
                    : item.checked
                        ? "border-emerald-200 bg-emerald-50/30"
                        : "border-gray-200 bg-white shadow-sm hover:border-gray-300"
            }`}
        >
            <div className="space-y-4">
                {/* Title & Badge */}
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                        <span className={`font-sans text-[15px] font-bold transition-colors ${item.checked ? "text-[#0d3d2b]/60" : "text-[#0d3d2b]"}`}>
                            {item.name || item.title}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${isMandatory ? "bg-red-50 text-red-500 border border-red-100" : "bg-gray-50 text-gray-400 border border-gray-100"}`}>
                            {isMandatory ? "Mandatory" : "Optional"}
                        </span>
                    </div>
                    {isHighlighted && (
                        <div className="flex items-center gap-2 mt-1 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[11px] font-bold animate-in fade-in slide-in-from-top-1 duration-300">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            You missed this mandatory field — please complete it to continue.
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    {/* 1. Date Picker */}
                    {(item.type?.toLowerCase().includes("date") || item.name?.toLowerCase().includes("date")) && (
                        <CustomDatePicker
                            value={item.response || ""}
                            onChange={(val) => onUpdateItem(item.id, { response: val })}
                        />
                    )}

                    {/* 2. Text/Number Input */}
                    {((item.type?.toLowerCase().includes("text") || item.type?.toLowerCase().includes("number")) && !item.type?.toLowerCase().includes("date")) && (
                        (item.name || item.title || "").toLowerCase().includes("dmc name") ? (
                            <DmcNamesInput
                                value={item.response || ""}
                                onChange={(val: string) => onUpdateItem(item.id, { response: val })}
                            />
                        ) : (
                            <TextInput
                                type={item.type?.toLowerCase().includes("number") ? "number" : "text"}
                                value={item.response || ""}
                                placeholder={item.placeholder || "Enter details here..."}
                                onChange={(val: string) => onUpdateItem(item.id, { response: val })}
                            />
                        )
                    )}

                    {/* 3. File Upload */}
                    {["file_upload", "file"].some(t => item.type?.toLowerCase().includes(t)) && (
                        <div className="space-y-3">
                            {currentUrls.length < 10 ? (
                                <label className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-gray-200 bg-white hover:bg-[#1D9E75]/5 hover:border-[#1D9E75]/30 cursor-pointer transition-all group/upload">
                                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-3 group-hover/upload:bg-[#1D9E75]/10 transition-colors">
                                        <UploadCloud className="w-5 h-5 text-gray-400 group-hover/upload:text-[#1D9E75]" />
                                    </div>
                                    <p className="font-sans text-xs font-bold text-[#0d3d2b]">Click to upload or drag and drop</p>
                                    <p className="font-sans text-[10px] text-gray-400 mt-1">Upload up to 10 files (JPG, PNG, PDF)</p>
                                    <input 
                                        type="file" 
                                        multiple
                                        className="hidden" 
                                        onChange={async (e) => {
                                            const selectedFiles = Array.from(e.target.files || []);
                                            if (selectedFiles.length === 0) return;
                                            if (currentUrls.length + selectedFiles.length > 10) {
                                                showDialog({
                                                    title: "Warning",
                                                    message: "Maximum 10 files can be uploaded per checklist item.",
                                                    type: "warning"
                                                });
                                                return;
                                            }
                                            // Create local preview URLs using URL.createObjectURL(file)
                                            const newPreviews = { ...localPreviews };
                                            for (const file of selectedFiles) {
                                                newPreviews[file.name] = URL.createObjectURL(file);
                                            }
                                            setLocalPreviews(newPreviews);
                                            
                                            await onFileUpload(item.id, selectedFiles);
                                        }}
                                        disabled={!!uploadingItemId}
                                    />
                                </label>
                            ) : (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>Maximum limit of 10 attachments reached. Delete existing files to upload new ones.</span>
                                </div>
                            )}

                            {uploadingItemId === item.id && (
                                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                                    <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin border-[#1D9E75]" />
                                    <span className="font-sans text-xs text-gray-500">Uploading files...</span>
                                </div>
                            )}

                            {currentUrls.length > 0 && (
                                <div className="flex flex-wrap gap-3 mt-2">
                                    {currentUrls.map((url: string, idx: number) => (
                                        <FilePreview key={idx} url={url} size={72} onDelete={() => handleDeleteFile(url)} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 4. Checkbox Check (Acknowledgement) */}
                    {(item.requiresAcknowledgement || ["checkbox_check", "checkbox"].includes(item.type?.toLowerCase())) && (
                        <label className="flex items-center gap-4 p-4 rounded-xl bg-gray-100/50 border border-gray-100 cursor-pointer hover:bg-gray-100 transition-all group/ack">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${item.acknowledged ? "bg-[#1D9E75] border-[#1D9E75]" : "border-gray-300 group-hover/ack:border-[#1D9E75]"}`}>
                                {item.acknowledged && <CheckCircle className="w-3 h-3 text-white" />}
                                <input 
                                    type="checkbox" 
                                    className="hidden" 
                                    checked={item.acknowledged || false}
                                    onChange={(e) => onUpdateItem(item.id, { acknowledged: e.target.checked })}
                                />
                            </div>
                            <span className="font-sans text-[11px] font-bold text-gray-500 uppercase tracking-wider">Yes, I have completed this step</span>
                        </label>
                    )}

                    {/* 5. Multiple Choice */}
                    {(item.type?.toLowerCase() === "multiple_choice") && (
                        <div className="flex flex-wrap gap-2 pt-1">
                            {item.options && item.options.length > 0 ? (
                                <>
                                    {item.options.map((opt: string) => {
                                        const isSelected = item.response === opt;
                                        return (
                                            <button
                                                key={opt}
                                                onClick={() => onUpdateItem(item.id, { response: opt })}
                                                className={`flex items-center gap-2.5 px-[20px] py-[6px] rounded-[20px] border transition-all text-left ${
                                                    isSelected 
                                                    ? "bg-[#f0faf6] border-[#1D9E75] text-[#0d3d2b]" 
                                                    : "bg-white border-[#d1d5db] text-gray-500 hover:border-gray-400"
                                                }`}
                                            >
                                                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? "border-[#1D9E75] bg-[#1D9E75]" : "border-gray-300"}`}>
                                                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                </div>
                                                <span className="font-sans text-[12px] font-semibold leading-none">{opt}</span>
                                            </button>
                                        )
                                    })}
                                </>
                            ) : (
                                <TextInput
                                    type="text"
                                    value={item.response || ""}
                                    placeholder="Enter response..."
                                    onChange={(val: string) => onUpdateItem(item.id, { response: val })}
                                />
                            )}
                        </div>
                    )}

                    {/* Italic Muted Helper Note */}
                    {item.notes && (
                        <p className="font-sans text-[11px] text-gray-400 italic px-1 flex gap-2">
                            <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            {item.notes}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
});

const TextInput = React.memo(({ value, placeholder, onChange, type }: any) => {
    // We use defaultValue for uncontrolled stability against re-renders
    // while still syncing changes to the parent
    return (
        <input 
            type={type}
            defaultValue={value || ""} 
            onChange={(e) => onChange(e.target.value)} 
            placeholder={placeholder}
            className="w-full px-5 py-3 rounded-xl border border-gray-200 bg-white font-sans text-sm text-[#0d3d2b] focus:ring-2 focus:ring-[#1D9E75]/10 focus:border-[#1D9E75] outline-none transition-all shadow-sm"
        />
    );
});

// Multi-value input for the "DMC Name" item — lets sales add 2+ DMCs. Stored comma-joined in
// item.response so the Pre-Ops Sales Handover view and the Post-Ops Ops Info pre-fill both show
// all names with no changes needed on their side.
const DmcNamesInput = React.memo(({ value, onChange }: any) => {
    const [names, setNames] = useState<string[]>(() => {
        const arr = (value || "").split(",").map((s: string) => s.trim()).filter(Boolean);
        return arr.length ? arr : [""];
    });

    const sync = (next: string[]) => {
        setNames(next);
        onChange(next.map(s => s.trim()).filter(Boolean).join(", "));
    };

    return (
        <div className="space-y-2">
            {names.map((name, i) => (
                <div key={i} className="flex items-center gap-2">
                    <input
                        type="text"
                        value={name}
                        placeholder={`DMC ${i + 1} name`}
                        onChange={(e) => { const next = [...names]; next[i] = e.target.value; sync(next); }}
                        className="flex-1 px-5 py-3 rounded-xl border border-gray-200 bg-white font-sans text-sm text-[#0d3d2b] focus:ring-2 focus:ring-[#1D9E75]/10 focus:border-[#1D9E75] outline-none transition-all shadow-sm"
                    />
                    {names.length > 1 && (
                        <button type="button" onClick={() => sync(names.filter((_, j) => j !== i))} className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            ))}
            <button
                type="button"
                onClick={() => sync([...names, ""])}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#1D9E75] hover:text-[#1a8c68] transition-colors"
            >
                <Plus className="w-3.5 h-3.5" /> Add another DMC
            </button>
        </div>
    );
});

MemoizedChecklistItem.displayName = "MemoizedChecklistItem";
TextInput.displayName = "TextInput";
DmcNamesInput.displayName = "DmcNamesInput";
