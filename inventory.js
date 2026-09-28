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
    id: "2019-ezgo-express-l6",
    status: "available",
    year: 2019,
    make: "EZGO",
    model: "Express L6",
    name: "EZGO Express L6 Six Passenger, 72V Lithium",
    price: 9500,
    seats: 6,
    power: "lithium",
    voltage: "72V",
    batteryDetail: "FLLYROWER LiFePO4 72V 105Ah",
    topSpeed: "25 mph",
    lifted: true,
    color: "Black",
    location: "Nocatee, FL",
    photos: [
      "images/carts/ezgo-express-l6-2019.webp",
      "images/carts/ezgo-express-l6-2019-front.webp",
      "images/carts/ezgo-express-l6-2019-side.webp",
      "images/carts/ezgo-express-l6-2019-rear.webp",
      "images/carts/ezgo-express-l6-2019-night-front.webp",
      "images/carts/ezgo-express-l6-2019-night-rear.webp",
      "images/carts/ezgo-express-l6-2019-cockpit.webp",
      "images/carts/ezgo-express-l6-2019-dash.webp",
      "images/carts/ezgo-express-l6-2019-screen.webp",
      "images/carts/ezgo-express-l6-2019-battery-display.webp",
      "images/carts/ezgo-express-l6-2019-usb.webp",
      "images/carts/ezgo-express-l6-2019-soundbar.webp",
      "images/carts/ezgo-express-l6-2019-wheel.webp",
      "images/carts/ezgo-express-l6-2019-battery.webp"
    ],
    highlights: [
      "72V LiFePO4 lithium, 105Ah",
      "GPS-verified 25 mph",
      "Lifted, 14-inch SS wheels, 23x10R14 street tires",
      "CarPlay and Android Auto screen",
      "Kemimoto Bluetooth soundbar",
      "RHOX LED headlights, underglow, light bar",
      "Rear flip seat",
      "Upgrades available before delivery"
    ],
    summary: "Lifted six passenger converted from lead-acid to a 72V lithium pack with its matched 18A charger mounted onboard. Controller reprogrammed for the pack, LED headlights, turn signals, CarPlay screen and Bluetooth soundbar. Comes with a written Cart Report and free delivery in the Nocatee corridor. Upgrades and customization available before delivery.",
    description: [
      "2019 EZGO Express L6 six passenger, lifted, on a 72V FLLYROWER LiFePO4 lithium pack with its matched 18A charger mounted onboard. Top speed GPS-verified at 25 mph.",
      "I've been through this cart end to end: factory lead-acid bank removed and replaced with a 105Ah lithium pack, controller reprogrammed for the new pack with smoother acceleration, new LED headlights, turn signals with hazards, and a hardwired dash.",
      "Lift kit, 14-inch SS wheels on 23x10R14 street tires, fender flares, brush guard, OEM top, folding windshield, side mirrors, rear seat that folds down into a cargo deck, RHOX LED headlights with color halos, underglow, roof light bar, Kemimoto Bluetooth soundbar, 10-inch CarPlay and Android Auto screen, live battery display, USB-C and QC 3.0 charging with voltmeter.",
      "Upgrades and customization are available before delivery: audio, lighting, wheels and tires, seats and upholstery, and custom finishes. Tell me what you have in mind and I'll quote it at the walkthrough, then have it done before it reaches your driveway.",
      "Includes a written Cart Report, free delivery and walkthrough in Nocatee, Ponte Vedra, St. Johns, St. Augustine, and Jacksonville ($3 per mile outside that area), charger and keys.",
      "Sold as a golf cart; on-road compliance is the buyer's responsibility."
    ],
    reportUrl: "https://cartfol.io/nickfury/the-night-shift",
    inquirySubject: "Inquiry: 2019 EZGO Express L6 $9,500"
  },
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
      "3,177 miles",
      "Upgrades available before delivery"
    ],
    summary: "Factory-lifted six passenger converted to an Eco Battery 51.2V lithium pack with the matching CAN charger. Four-wheel disc brakes, glass windshield with wiper, 10-inch dash. Comes with a written Cart Report and free delivery in the Nocatee corridor. Upgrades and customization available before delivery.",
    description: [
      "2023 EPIC E60L six passenger, factory lifted, on a 51.2V Eco Battery lithium pack with the matching Eco CAN charger. 3,177 miles. Top speed GPS-verified at 25 mph.",
      "I've been through this cart end to end: lead-acid pack removed and replaced with the Eco Battery lithium system, controller tuned for the pack, brakes checked on all four corners, wheel studs replaced and lugs torqued to spec.",
      "Four-wheel hydraulic disc brakes, BEAST Black Piranha 14-inch wheels on Ironclad A/T 23x10-14 tires, extended blue top, glass windshield with wiper, folding mirrors, black diamond-stitched seats with blue stitching, rear flip seat that converts to a cargo deck, 10-inch color dash, LED light bar, LED headlights and taillights, turn signals, Bluetooth soundbar, front brush guard with cargo basket, running boards, fender flares.",
      "Upgrades and customization are available before delivery: audio, lighting, wheels and tires, seats and upholstery, and custom finishes. Tell me what you have in mind and I'll quote it at the walkthrough, then have it done before it reaches your driveway.",
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
      "2,331 miles",
      "Upgrades available before delivery"
    ],
    summary: "Factory-lifted six passenger on the same Eco Battery lithium pack ICON installs new, with the matching CAN charger. Controller tuned, speedometer calibrated against GPS, brakes and suspension checked. Comes with a written Cart Report and free delivery in the Nocatee corridor. Upgrades and customization available before delivery.",
    description: [
      "2024 ICON i60L six passenger, factory lifted, on a 51.2V Eco Battery lithium pack with the EB gauge and matching Eco CAN charger. 2,331 miles. Top speed GPS-verified at 25 mph.",
      "I've been through this cart end to end: controller reprogrammed and tuned for the Eco pack, speedometer calibrated against GPS on the 23-inch tires, brakes and suspension checked, tire pressures set.",
      "Extended white top, fold-down windshield, folding mirrors, brown premium seats with a rear flip seat that converts to a cargo deck, LED headlights and taillights, front brush guard, running boards, fender flares, Bluetooth LED soundbar with color control, front disc brakes.",
      "Upgrades and customization are available before delivery: audio, lighting, wheels and tires, seats and upholstery, and custom finishes. Tell me what you have in mind and I'll quote it at the walkthrough, then have it done before it reaches your driveway.",
      "Includes a written Cart Report, free delivery and walkthrough in Nocatee, Ponte Vedra, St. Johns, St. Augustine, and Jacksonville ($3 per mile outside that area), charger and keys.",
      "Sold as a golf cart; on-road compliance is the buyer's responsibility."
    ],
    reportUrl: "https://cartfol.io/nickfury/the-long-ranger",
    inquirySubject: "Inquiry: 2024 ICON i60L $9,900"
  }
];
