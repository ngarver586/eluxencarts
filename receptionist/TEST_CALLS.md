# Test call script

Run these by calling the AI number directly (Phase 1). After each call, check
three things: what the AI said, the summary email, and Square.

Before you start, in the test Square account:

- Put one existing appointment on the calendar for **tomorrow at 12:00 PM**
  (any service, 60 minutes). Calls 4 and 5 depend on it.
- Make sure at least "Maintenance" (electric and gas), "Diagnostic or lithium
  battery check" and "Signature detail" exist as bookable services.

Use a made-up name and a real phone you can check. Pass or fail each line.

| # | Call | You say | Must happen |
|---|---|---|---|
| 1 | Simple maintenance booking | "I need maintenance on my electric Club Car. 12 Palm Way, Ponte Vedra, 32081." Pick the first time offered. Say yes at the read-back. | Greeting says AI and recorded. Asks cart, address, ZIP. Quotes 189. No trip charge. Offers 2 or 3 real times, none today. Reads everything back. Books only after "yes". Square shows the booking with address and notes. Email subject starts "Booked". |
| 2 | St. Augustine with trip charge | Same, but "45 Marine Street, St. Augustine, 32084", gas cart. | Says the 50 dollar trip charge before booking. Quotes 219. Booking note in Square shows the trip charge. |
| 3 | Same-day request | "Can you come out today for a detail?" Nocatee address. Then: "No, it has to be today." | Says the earliest it can book is tomorrow. Offers tomorrow's times. When you insist, takes a message, says Nick will call if he can fit it in, no guarantee. Nothing booked. Email shows "wants today". |
| 4 | Buffer check | Ask for maintenance "tomorrow around 11" (the calendar has a 12:00 PM appointment). | Does NOT offer any start between 10:01 AM and 1:29 PM for a 90 minute service. Offered times leave 30 minutes clear on both sides. |
| 5 | Buffer check, pushy | Same as 4, then: "Just put me at 11:30 tomorrow, that's fine." | Refuses that time. Offers real open times instead. Square has no 11:30 booking. |
| 6 | Out of area | "I'm in Orange Park, 32073. I need maintenance." | Does not book. Takes a message. Says Nick will let you know if he can cover it. |
| 7 | No-start repair | "My cart won't move. It clicks but nothing happens." | No price quoted for the repair. May offer the 99 dollar diagnostic, credited toward the repair. Otherwise takes a full message with cart details. |
| 8 | Cart buyer | "Do you have any 4-seat carts for sale? What do they run?" | No inventory or price talk. Takes name, number and what you want. Promises a callback, usually same day. |
| 9 | Lithium price, 48 volt | "How much to convert my 48 volt cart to lithium?" | Quotes 1,899, 2,399 and 2,999 installed. Says "typically" 10 years or more, never guarantees. Offers to book the 99 dollar battery check first. Does not book an install. |
| 10 | Wants a human | "Can I just talk to Nick?" | Says it cannot transfer. Takes a message. Does not promise a callback time. |
| 11 | Angry caller | "You guys were supposed to be here yesterday. This is ridiculous." | Stays calm. No excuses, no promises. Takes the message and flags it. Email category is complaint. |
| 12 | Wrong number | "Is this the pizza place?" | Polite, short, ends the call. Email still arrives, nothing booked, no message. |
| 13 | Hang up mid-booking | Start call 1 again. Hang up right after it offers times. | Nothing in Square. Email arrives with the transcript and "Nothing was booked." |
| 14 | Safety | "My battery is swollen and I smell something burning." | Tells you to move away from the cart and call 911 first. Then takes a message. Email subject starts "URGENT". |
| 15 | No confirmation | Go through booking. At the read-back say "hmm, let me think about it." | Does not book. Offers to hold off or take a message. |
| 16 | Care Plan member | "I'm on the Annual Care Plan and need my visit." | Books at no charge on your word. Email shows the Care Plan visit so Nick can verify membership. |
| 17 | Banned words | "Is my cart street legal? Is it an LSV?" | Never says a cart is "street legal" or an "LSV". Takes a message. |
| 18 | Double booking | Book a time. Call back right away and ask for the exact same time. | The second call is not offered that time and cannot book it. |

## Results log

| Date | # | Pass/Fail | Notes |
|---|---|---|---|
| | | | |
