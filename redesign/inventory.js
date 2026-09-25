/*
  Eluxen Carts inventory.
  Add one object per cart. Newest first. Remove a cart (or set status: "sold") when it's gone.

  {
    id: "2024-icon-i60l-black",          // unique, lowercase, dashes
    status: "available",                  // "available" | "pending" | "sold"
    year: 2024,
    make: "ICON",
    model: "i60L",
    price: 12995,                         // number, no $ or commas
    seats: 6,
    power: "lithium",                     // "lithium" | "lead-acid" | "gas"
    voltage: "72V",
    batteryYear: 2024,                    // optional
    topSpeed: "25 mph",                   // optional
    range: "40 mi",                       // optional
    streetLegal: true,
    lifted: true,
    color: "Black",
    warranty: "",                         // optional, e.g. "Battery warranty through 2029"
    photos: ["images/carts/2024-icon-i60l-1.webp"],
    highlights: ["6\" lift", "LED light kit"],
    description: "One or two sentences about the cart."
  }
*/
window.INVENTORY = [];
