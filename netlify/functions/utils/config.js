// Edit this file to change services, prices, hours, deposits, and policies.
// Deposit rule: $75 non-refundable deposit, or the full service price if it is less than $75.

export default {
  businessName: "Myrtle's Detox & Wellness Spa",
  timezone: "America/New_York",
  slotMinutes: 60,
  bookingWindowDays: 60,
  pendingHoldMinutes: 15,
  minHoursAhead: 36, // no appointments may be booked less than 36 hours in advance

  // Regular hours: Monday-Thursday, first appt 10:00 AM, last appt 5:00 PM.
  // Close is set to 18:00 so the last 60-min slot starts at 17:00.
  // Fri/Sun = null (flex/Sunday by request only; owner adds these manually in admin).
  // Sat = null and CLOSED (no appointments).
  // Sunday prepay-in-full totals (incl. $25 flex fee): Colonic $135, Foot Detox $95, Colonic + Foot Detox $205.
  // A day can be: null (closed), ["open","close"] (hourly slots), or { slots: [...] } (exact times).
  hours: {
    0: { slots: ["13:30", "15:00"] },
    1: ["10:00", "18:00"],
    2: ["10:00", "18:00"],
    3: ["10:00", "18:00"],
    4: ["10:00", "18:00"],
    5: null,
    6: null,
  },

  // Sundays are PREPAID IN FULL (includes the $25 flex fee).
  // Exact totals here; any other service booked on Sunday = its price + flexFee.
  flexFee: 25,
  sundayPrepay: {
    "colonic": 135,
    "foot-detox": 95,
  },

  // price: display label. deposit: amount due to reserve (min($75, price)).
  // Services sharing a "group" render as ONE card with a duration dropdown.
  // "img" points at the shared photo in public/img/ (defaults to the id).
  // "times": specific weekday start times for that service (otherwise the hourly grid is used).
  // Each service/group has its own station, so different services CAN be booked at overlapping times.
  services: [
    { id: "body-analysis", name: "Vital Health Body Analysis", price: "$50", deposit: 50 },
    { id: "consultation", name: "Consultation (post Body Analysis)", price: "$100", deposit: 75 },
    { id: "colonic", name: "Colonic", price: "$110", deposit: 75, times: ["10:00", "11:30", "13:30", "15:30", "17:00"], note: "2-hour appointment · 5:30 PM start by request (flex)" },
    { id: "colonic-abd", name: "Colonic & Abdominal Manipulation Treatment", price: "$175", deposit: 75 },
    { id: "foot-detox", name: "Foot Detox", price: "$70", deposit: 70, times: ["11:00", "12:30", "14:30", "16:00", "16:30"] },
    { id: "hydromassage-10", name: "HydroMassage — 10 min", label: "10 min", price: "$40", deposit: 40, group: "HydroMassage", times: ["10:30", "12:00", "14:00", "16:00", "16:30"], img: "hydromassage" },
    { id: "hydromassage-15", name: "HydroMassage — 15 min", label: "15 min", price: "$60", deposit: 60, group: "HydroMassage", times: ["10:30", "12:00", "14:00", "16:00", "16:30"], img: "hydromassage" },
    { id: "hydromassage-20", name: "HydroMassage — 20 min", label: "20 min", price: "$70", deposit: 70, group: "HydroMassage", times: ["10:30", "12:00", "14:00", "16:00", "16:30"], img: "hydromassage" },
    { id: "hydromassage-30", name: "HydroMassage — 30 min", label: "30 min", price: "$90", deposit: 75, group: "HydroMassage", times: ["10:30", "12:00", "14:00", "16:00", "16:30"], img: "hydromassage" },
    { id: "body-wrap", name: "Alkalyzing Body Wrap", price: "$125", deposit: 75, times: ["11:00", "15:00"] },
    { id: "sauna-15", name: "Sauna — 15 min", label: "15 min", price: "$50", deposit: 50, group: "Sauna", img: "sauna" },
    { id: "sauna-20", name: "Sauna — 20 min", label: "20 min", price: "$55", deposit: 55, group: "Sauna", img: "sauna" },
    { id: "sauna-25", name: "Sauna — 25 min", label: "25 min", price: "$60", deposit: 60, group: "Sauna", img: "sauna" },
    { id: "sauna-30", name: "Sauna — 30 min", label: "30 min", price: "$65", deposit: 65, group: "Sauna", img: "sauna" },
    { id: "body-part-manip", name: "Body Part Manipulation Therapy (Cranial / Spinal / Abdominal)", price: "$75-$150", deposit: 75 },
  ],

  paymentMethods: {
    zelle: "myrtle_rogers@yahoo.com",
    cashApp: "340-513-2343",
    cashTag: "MyrtlesDetox",
    payPalHandle: "MyrtleRogers296",
  },

  policies: [
    "Appointments must be booked at least 36 hours in advance.",
    "A non-refundable deposit is required from ALL clients: $75, or the full amount if the service fee is less. Deposits are never refunded as cash, but may carry over as credit per the policies below.",
    "Cancel or reschedule MORE than 24 hours ahead: your full deposit is credited toward your new appointment.",
    "Missed appointments, or those cancelled/rescheduled LESS than 24 hours ahead: a $50.00 fee is secured from the deposit; any remainder is credited toward a future appointment (e.g. $75 deposit = $25 credit).",
    "The remainder may be paid in cash on the day of the appointment, or pre-paid in full.",
    "Appointments are scheduled and confirmed as deposits are received.",
    "Flex hours (days/times outside regular hours) are available for $25 per person per request - contact us to arrange.",
    "CLOSED on Fridays and Saturdays - no appointments.",
    "Sundays: two slots available (1:30 PM & 3:00 PM), $25 flex fee applied. Any service may be booked but must be PREPAID in full BY THE THURSDAY BEFORE: Colonic - $135 | Foot Detox - $95 | Colonic + Foot Detox - $205 | all other services - price + $25. Online Sunday booking closes Thursday night.",
    "If the payment options aren't available to you, someone else may make the deposit for you - have them indicate who the funds are for.",
  ],
};
