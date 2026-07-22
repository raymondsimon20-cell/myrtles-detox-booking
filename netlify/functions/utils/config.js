// Edit this file to change services, prices, hours, deposits, and policies.
// Deposit rule: $75 non-refundable deposit, or the full service price if it is less than $75.

export default {
  businessName: "Myrtle's Detox & Wellness Spa",
  timezone: "America/New_York",
  slotMinutes: 60,
  bookingWindowDays: 60,
  pendingHoldMinutes: 15,

  // Regular hours: Monday-Thursday, first appt 10:00 AM, last appt 5:00 PM.
  // Close is set to 18:00 so the last 60-min slot starts at 17:00.
  // Fri/Sat/Sun = null (flex hours by request only; owner can add manually in admin).
  hours: {
    0: null,
    1: ["10:00", "18:00"],
    2: ["10:00", "18:00"],
    3: ["10:00", "18:00"],
    4: ["10:00", "18:00"],
    5: null,
    6: null,
  },

  // price: display label. deposit: amount due to reserve (min($75, price)).
  // Services sharing a "group" render as ONE card with a duration dropdown.
  // "img" points at the shared photo in public/img/ (defaults to the id).
  services: [
    { id: "body-analysis", name: "Vital Health Body Analysis", price: "$50", deposit: 50 },
    { id: "consultation", name: "Consultation (post Body Analysis)", price: "$100", deposit: 75 },
    { id: "colonic", name: "Colonic", price: "$110", deposit: 75 },
    { id: "colonic-abd", name: "Colonic & Abdominal Manipulation Tx", price: "$175", deposit: 75 },
    { id: "foot-detox", name: "Foot Detox", price: "$70", deposit: 70 },
    { id: "hydromassage-10", name: "HydroMassage — 10 min", label: "10 min", price: "$40", deposit: 40, group: "HydroMassage", img: "hydromassage" },
    { id: "hydromassage-15", name: "HydroMassage — 15 min", label: "15 min", price: "$60", deposit: 60, group: "HydroMassage", img: "hydromassage" },
    { id: "hydromassage-20", name: "HydroMassage — 20 min", label: "20 min", price: "$70", deposit: 70, group: "HydroMassage", img: "hydromassage" },
    { id: "hydromassage-30", name: "HydroMassage — 30 min", label: "30 min", price: "$90", deposit: 75, group: "HydroMassage", img: "hydromassage" },
    { id: "body-wrap", name: "Alkalyzing Body Wrap", price: "$125", deposit: 75 },
    { id: "sauna-15", name: "Sauna — 15 min", label: "15 min", price: "$50", deposit: 50, group: "Sauna", img: "sauna" },
    { id: "sauna-20", name: "Sauna — 20 min", label: "20 min", price: "$55", deposit: 55, group: "Sauna", img: "sauna" },
    { id: "sauna-25", name: "Sauna — 25 min", label: "25 min", price: "$60", deposit: 60, group: "Sauna", img: "sauna" },
    { id: "sauna-30", name: "Sauna — 30 min", label: "30 min", price: "$65", deposit: 65, group: "Sauna", img: "sauna" },
    { id: "body-part-manip", name: "Body Part Manipulation Therapy (Cranial / Spinal / Abdominal)", price: "$75-$150", deposit: 75 },
  ],

  paymentMethods: {
    zelle: "myrtle.rogers724@gmail.com",
    cashApp: "340-513-2343",
    payPalHandle: "MyrtleRogers296",
  },

  policies: [
    "A non-refundable deposit is required from ALL clients: $75, or the full amount if the service fee is less.",
    "$50.00 will be secured for all missed appointments and those cancelled or rescheduled less than 24 hours ahead of appointment time.",
    "The remainder may be paid in cash on the day of the appointment, or pre-paid in full.",
    "Appointments are scheduled and confirmed as deposits are received.",
    "Flex hours (days/times outside regular hours) are available for $25 per person per request - contact us to arrange.",
    "Some Sundays are available. ALL Sundays must be PREPAID in full, including the $25 flex fee, prior to scheduling.",
    "If the payment options aren't available to you, someone else may make the deposit for you - have them indicate who the funds are for.",
  ],
};
