// The Outbound Management hub. TMS has no login of its own — anything that used
// to send the user to /login now sends them to the hub (the single sign-in).
export const HUB_URL =
  process.env.NEXT_PUBLIC_HUB_URL || "http://hrms.outbound.local:3000/hub"

export function goToHub() {
  if (typeof window !== "undefined") window.location.href = HUB_URL
}
