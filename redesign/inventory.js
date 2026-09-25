/*
  Eluxen Carts inventory.
  Add one object per cart. Newest first. Remove a cart (or set status: "sold") when it's gone.

  Required: id, status ("available" | "pending" | "sold"), year, make, model, price, seats, power, photos.
  Optional: name (card title; defaults to "Year Make Model"), voltage, batteryYear, topSpeed, range, miles,
  streetLegal, lifted, color, warranty, location, highlights, summary (card text), description (detail text),
  reportUrl (Cart Report link), inquirySubject (email subject).
  Leave a field out rather than guessing; the site only shows what's filled in.
*/
window.INVENTORY = [
  {
    id: "2024-icon-i60l",
    status: "available",
    year: 2024,
    make: "ICON",
    model: "i60L",
    name: "ICON i60L Six Passenger, Eco Lithium",
    price: 9900,
    seats: 6,
    power: "lithium",
    voltage: "51.2V",
    batteryDetail: "Eco Battery 51.2V 105Ah",
    topSpeed: "25 mph",
    miles: 2331,
    lifted: true,
    location: "Nocatee, FL",
    photos: [
      "images/carts/icon-i60l-2024.webp",
      "images/carts/icon-i60l-2024-front.webp",
      "images/carts/icon-i60l-2024-side.webp",
      "images/carts/icon-i60l-2024-dash.webp",
      "images/carts/icon-i60l-2024-rear.webp",
      "images/carts/icon-i60l-2024-soundbar.webp",
      "images/carts/icon-i60l-2024-battery.webp"
    ],
    highlights: [
      "Eco Battery 51.2V 105Ah",
      "GPS-verified 25 mph",
      "Factory lifted, 23-inch Gladiators",
      "Extended top, fold-down windshield",
      "Brown premium seats, rear flip seat",
      "Bluetooth LED soundbar",
      "LED lights, brush guard, running boards",
      "2,331 miles"
    ],
    summary: "Factory-lifted six passenger on the same Eco Battery lithium pack ICON installs new, with the matching CAN charger. Controller tuned, speedometer calibrated against GPS, brakes and suspension checked. Comes with a written Cart Report and free delivery in the Nocatee corridor.",
    description: [
      "2024 ICON i60L six passenger, factory lifted, on a 51.2V Eco Battery lithium pack with the EB gauge and matching Eco CAN charger. 2,331 miles. Top speed GPS-verified at 25 mph.",
      "I've been through this cart end to end: controller reprogrammed and tuned for the Eco pack, speedometer calibrated against GPS on the 23-inch tires, brakes and suspension checked, tire pressures set.",
      "Extended white top, fold-down windshield, folding mirrors, brown premium seats with a rear flip seat that converts to a cargo deck, LED headlights and taillights, front brush guard, running boards, fender flares, Bluetooth LED soundbar with color control, front disc brakes.",
      "Includes a written Cart Report, free delivery and walkthrough in Nocatee, Ponte Vedra, St. Johns, St. Augustine, and Jacksonville ($3 per mile outside that area), charger and keys.",
      "Sold as a golf cart; on-road compliance is the buyer's responsibility."
    ],
    reportUrl: "https://cartfol.io/nickfury/the-long-ranger",
    inquirySubject: "Inquiry: 2024 ICON i60L $9,900"
  }
];
