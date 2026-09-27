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
    id: "2023-epic-e60l",
    status: "available",
    year: 2023,
    make: "EPIC",
    model: "E60L",
    name: "EPIC E60L Six Passenger, Eco Lithium",
    price: 9900,
    seats: 6,
    power: "lithium",
    voltage: "51.2V",
    batteryDetail: "Eco Battery 51.2V 105Ah",
    topSpeed: "25 mph",
    miles: 3177,
    lifted: true,
    color: "Blue",
    location: "Nocatee, FL",
    photos: [
      "images/carts/epic-e60l-2023.webp",
      "images/carts/epic-e60l-2023-front.webp",
      "images/carts/epic-e60l-2023-side.webp",
      "images/carts/epic-e60l-2023-rear.webp",
      "images/carts/epic-e60l-2023-seats.webp",
      "images/carts/epic-e60l-2023-cockpit.webp",
      "images/carts/epic-e60l-2023-dash.webp",
      "images/carts/epic-e60l-2023-wheel.webp",
      "images/carts/epic-e60l-2023-battery.webp"
    ],
    highlights: [
      "Eco Battery 51.2V 105Ah",
      "GPS-verified 25 mph",
      "Four-wheel hydraulic disc brakes",
      "Factory lifted, BEAST Black Piranha wheels",
      "Ironclad A/T 23x10-14 tires",
      "Glass windshield with wiper",
      "Diamond-stitched seats, rear flip seat",
      "3,177 miles"
    ],
    summary: "Factory-lifted six passenger converted to the Eco Battery lithium pack ICON installs new, with the matching CAN charger. Four-wheel disc brakes, glass windshield with wiper, 10-inch dash. Comes with a written Cart Report and free delivery in the Nocatee corridor.",
    description: [
      "2023 EPIC E60L six passenger, factory lifted, on a 51.2V Eco Battery lithium pack with the matching Eco CAN charger. 3,177 miles. Top speed GPS-verified at 25 mph.",
      "I've been through this cart end to end: lead-acid pack removed and replaced with the Eco Battery lithium system, controller tuned for the pack, brakes checked on all four corners, wheel studs replaced and lugs torqued to spec.",
      "Four-wheel hydraulic disc brakes, BEAST Black Piranha 14-inch wheels on Ironclad A/T 23x10-14 tires, extended blue top, glass windshield with wiper, folding mirrors, black diamond-stitched seats with blue stitching, rear flip seat that converts to a cargo deck, 10-inch color dash, LED light bar, LED headlights and taillights, turn signals, Bluetooth soundbar, front brush guard with cargo basket, running boards, fender flares.",
      "Includes a written Cart Report, free delivery and walkthrough in Nocatee, Ponte Vedra, St. Johns, St. Augustine, and Jacksonville ($3 per mile outside that area), charger and keys.",
      "Sold as a golf cart; on-road compliance is the buyer's responsibility."
    ],
    reportUrl: "https://cartfol.io/nickfury/the-blue-horizon",
    inquirySubject: "Inquiry: 2023 EPIC E60L $9,900"
  },
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
