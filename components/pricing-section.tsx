"use client"

import { Star, User, Baby } from "lucide-react"

interface PricingPlan {
  hotelName: string
  category: string
  total: number
  perPersonPrice: number
  perAdultPrice?: number
  perChildPrice?: number
  eligibleChildrenCount?: number
  // Weighted per-passenger breakdown
  perChildWithBedPrice?: number
  perChildNoBedPrice?: number
  perInfantPrice?: number
  adultsCount?: number
  childWithBedCount?: number
  childNoBedCount?: number
  infantCount?: number
  image?: string
}

interface PricingSectionProps {
  price?: string
  plans?: PricingPlan[]
  inclusions?: string | string[]
  gstNote?: string
  applyGST?: boolean
  applyTCS?: boolean
  baseUrl?: string
  adults?: number
  children?: number
}

const defaultImages = [
  "/images/bg/page_003.png",
  "/images/bg/page_004.png",
  "/images/bg/page_006.png"
]

export function PricingSection({ price, plans, inclusions, gstNote, applyGST, applyTCS, baseUrl, adults, children }: PricingSectionProps = {}) {
  const numAdults = adults && adults > 0 ? adults : 1
  const numKids = children && children > 0 ? children : 0
  const totalPackageAmount = price ? parseInt(price.replace(/[^0-9]/g, '')) || 0 : 0

  let perAdultCost = 0
  let perKidCost = 0

  if (numKids > 0) {
    const adultTotal = totalPackageAmount * 0.85
    perAdultCost = Math.round(adultTotal / numAdults)
    const kidTotal = totalPackageAmount * 0.15
    perKidCost = Math.round(kidTotal / numKids)
  } else {
    perAdultCost = Math.round(totalPackageAmount / numAdults)
  }

  let baseInclusions: string[] = []
  if (typeof inclusions === 'string') {
    baseInclusions = inclusions.split(',').map(item => item.trim()).filter(item => item !== "")
  } else if (Array.isArray(inclusions)) {
    baseInclusions = inclusions
  } else {
    baseInclusions = ['Hand Baggage 7kg', 'Check-in 15kg']
  }

  const displayInclusions = [...baseInclusions]
  if (applyGST) displayInclusions.push('GST 5% Inclusive')
  if (applyTCS) displayInclusions.push('TCS 2% + GST Inclusive')
  const displayGst = gstNote || (applyGST ? '5% GST applicable on total package cost' : applyTCS ? 'TCS applicable for international trips' : '5% GST applicable on total package cost')
  const hasOptions = plans && plans.filter(p => p.total > 0).length > 0

  const getTierImage = (category: string) => {
    if (!category) return defaultImages[0]
    
    const normalized = category.toLowerCase().trim()
    
    // Formatting rules: 
    // "3 Star" -> "3star.png"
    // "Super Deluxe" -> "super deluxe.png"
    let fileName = normalized
    if (normalized.includes("star")) {
      fileName = normalized.replace(/\s+/g, "")
    }

    // Support custom.jpg instead of .png
    if (normalized.includes("custom")) {
      return `/images/hotel_tiers/custom.jpg`
    }
    
    return `/images/hotel_tiers/${fileName}.png`
  }

  return (
    <>
      {/* HEADER SECTION - Only for Built Packages with options */}
      {hasOptions && (
        <section
          className="relative pt-6 pb-8 px-4 overflow-hidden page-break-before pdf-section bg-[#051F10]"
          style={{
            backgroundImage: "url('/images/bg/page_008.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: '#051F10'
          }}
        >
          <div className="absolute inset-0 bg-[#00000088] pointer-events-none" />
          <div className="relative z-10 w-full text-center px-2">
            <h2 className="font-serif text-[2.2rem] tracking-tight font-black uppercase leading-none text-white drop-shadow-2xl">
              Select Your<br /><span className="text-[#FFE500]">Package Options</span>
            </h2>
            <div className="h-1.5 w-16 bg-[#FFE500] mx-auto mt-6 rounded-full shadow-[0_0_20px_rgba(255,229,0,0.5)]" />
          </div>
        </section>
      )}

      {/* PRICING CONTENT */}
      <div className="flex flex-col gap-0">
      {hasOptions ? (
        plans.filter(p => p.total > 0).map((plan, idx) => {
          return (
            <section
              key={idx}
              className="relative py-3 px-4 avoid-break pdf-section bg-[#051F10]"
              style={{
                backgroundImage: "url('/images/bg/page_008.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundColor: '#051F10'
              }}
            >
              <div className="absolute inset-0 bg-[#00000066] pointer-events-none" />
              <div className="relative z-10 w-full">
                <div className="bg-white rounded-[24px] overflow-hidden flex flex-col relative z-10 shadow-3xl border border-white/5">
                  {/* Top Image */}
                  <div className="w-full h-44 relative">
                    <img
                      src={plan.image || (baseUrl ? `${baseUrl.replace(/\/$/, "")}${getTierImage(plan.category)}` : getTierImage(plan.category))}
                      alt={plan.hotelName}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = defaultImages[idx % defaultImages.length]
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    
                    <div className="absolute top-4 left-4 bg-[#FFE500] px-4 py-1.5 rounded-lg shadow-lg">
                        <span className="font-sans text-[8px] font-black text-[#1A211D] uppercase tracking-widest">
                          OPTION {String(idx + 1).padStart(2, '0')}
                        </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-6 flex flex-col items-center text-center">
                    <div className="flex flex-col items-center mb-5">

                        <h3 className="font-sans text-xl font-black text-[#1A211D] uppercase tracking-tight leading-tight">
                          {plan.hotelName}
                        </h3>
                    </div>

                    <div className="w-10 h-0.5 bg-gray-100 mb-5 rounded-full" />

                    {/* Per-passenger price tiles (weighted). Builds only the tiles that apply. */}
                    {(() => {
                      const adultPrice = plan.perAdultPrice || plan.total || plan.perPersonPrice
                      const cwbCount = plan.childWithBedCount ?? 0
                      const cnbCount = plan.childNoBedCount ?? 0
                      const infCount = plan.infantCount ?? 0
                      const legacyChild = (plan.eligibleChildrenCount ?? 0) > 0 && plan.perChildPrice
                      const hasNewBreakdown = cwbCount > 0 || cnbCount > 0 || infCount > 0

                      type Tile = { icon: "adult" | "child" | "infant"; label: string; value: string }
                      const tiles: Tile[] = [{ icon: "adult", label: "Per Adult", value: `₹${adultPrice.toLocaleString()}` }]

                      if (hasNewBreakdown) {
                        if (cwbCount > 0) tiles.push({ icon: "child", label: "Child · With Bed", value: `₹${(plan.perChildWithBedPrice ?? plan.perChildPrice ?? 0).toLocaleString()}` })
                        if (cnbCount > 0) tiles.push({ icon: "child", label: "Child · No Bed", value: `₹${(plan.perChildNoBedPrice ?? 0).toLocaleString()}` })
                        if (infCount > 0) tiles.push({ icon: "infant", label: "Infant", value: (plan.perInfantPrice ?? 0) > 0 ? `₹${(plan.perInfantPrice ?? 0).toLocaleString()}` : "Complimentary" })
                      } else if (legacyChild) {
                        tiles.push({ icon: "child", label: "Per Child", value: `₹${(plan.perChildPrice ?? 0).toLocaleString()}` })
                      }

                      const cols = tiles.length >= 3 ? "grid-cols-3" : tiles.length === 2 ? "grid-cols-2" : "grid-cols-1"
                      const wrapper = tiles.length === 1 ? "flex justify-center w-full mb-6" : `grid ${cols} gap-3 w-full mb-6`
                      return (
                        <div className={wrapper}>
                          {tiles.map((t, ti) => (
                            <div key={ti} className={`bg-[#051F10] rounded-[16px] p-4 flex flex-col items-center justify-center border border-white/10 shadow-md ${tiles.length === 1 ? "w-full max-w-[220px]" : ""}`}>
                              <div className="flex items-center gap-1.5 mb-2">
                                {t.icon === "adult" ? <User className="w-3.5 h-3.5 text-white/70" data-pdf-color="white" /> : <Baby className="w-3.5 h-3.5 text-white/70" data-pdf-color="white" />}
                                <span className="font-sans text-[10px] font-black uppercase tracking-wider text-white/70" data-pdf-color="white">{t.label}</span>
                              </div>
                              <span className="font-sans text-xl font-black text-[#FFE500] tracking-tight leading-none mb-1.5 price-amount" data-pdf-color="yellow">{t.value}</span>
                              <span className="font-sans text-[8px] uppercase tracking-widest text-white/40 font-bold" data-pdf-color="white">{t.value === "Complimentary" ? "free" : "per person"}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    <div className="bg-[#051F10] px-4 py-3 rounded-xl flex items-center gap-2 shadow-xl w-full justify-center border border-white/5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#FFE500] animate-pulse" />
                      <span className="font-sans text-[9px] font-black text-white/80 uppercase tracking-tight" style={{ color: '#ffffff' }} data-pdf-color="white">
                        {displayGst}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )
        })
      ) : (
        /* READY MADE CARD DESIGN */
        <section
          className="relative py-16 px-6 avoid-break pdf-section bg-[#051F10]"
          style={{
            backgroundImage: "url('/images/bg/page_008.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: '#051F10'
          }}
        >
          <div className="absolute inset-0 bg-[#00000088] pointer-events-none" />
          <div className="relative z-10 w-full flex justify-center">
            <div className="bg-white rounded-[20px] p-10 shadow-2xl border border-gray-100 w-full max-w-xl flex flex-col items-center text-center">
                <p className="font-sans text-[13px] tracking-[0.15em] uppercase mb-1 font-black text-[#000000]">
                   Your Package Plan
                </p>
                
                <div className="h-[1.5px] w-8 bg-[#FFE500] mb-3" />

                <div className="flex flex-col items-center gap-6 mt-4 mb-10 w-full">
                  <div className="flex flex-col items-center">
                    <h2 className="font-sans text-5xl font-black text-[#000000] tracking-tighter leading-none mb-2 price-amount" data-pdf-color="black">
                      ₹{perAdultCost.toLocaleString()}
                    </h2>
                    <span className="font-sans text-[9px] font-black uppercase tracking-[0.25em] text-[#8E918F] per-person-label">
                      PER ADULT COST
                    </span>
                  </div>

                  {numKids > 0 && (
                    <div className="flex flex-col items-center">
                      <h2 className="font-sans text-4xl font-black text-[#000000] tracking-tighter leading-none mb-2 price-amount" data-pdf-color="black">
                        ₹{perKidCost.toLocaleString()}
                      </h2>
                      <span className="font-sans text-[9px] font-black uppercase tracking-[0.25em] text-[#8E918F] per-person-label">
                        PER KID COST
                      </span>
                    </div>
                  )}
                </div>

                <div className="w-full bg-[#000000] px-6 py-4 rounded-[12px] shadow-lg flex items-center justify-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#FFE500] animate-pulse" />
                    <span className="font-sans text-[10px] font-black uppercase tracking-widest text-[#FFE500] leading-relaxed" data-pdf-color="yellow">
                        {displayGst}
                    </span>
                </div>

                {displayInclusions.length > 0 && (
                   <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                      {displayInclusions.filter(item => item !== 'Per Person').map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 whitespace-nowrap bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                           <span className="font-sans text-[12px] font-black text-[#FFE500] leading-none">•</span>
                           <span className="font-sans text-[8px] font-black uppercase tracking-widest text-[#1A211D]/40 leading-none">{item}</span>
                        </div>
                      ))}
                   </div>
                )}
            </div>
          </div>
        </section>
      )}
      </div>
    </>
  )
}
