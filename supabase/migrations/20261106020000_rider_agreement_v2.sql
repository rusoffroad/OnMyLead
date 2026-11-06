-- Rider Safety and Liability Agreement, version 2 (Chris, 2026-11-06: "add a disclaimer about the
-- emergency function and to always dial 911 if you have an emergency ... put that [in] that thing
-- they have to accept at first launch"). Adds "Always Call 911 in an Emergency" (the EMERGENCY
-- button, Crash Alert, Need Help and the Emergency Siren only alert riders in the app) and puts it
-- in the checkbox line. Version 1 stays published, unchanged (rider_agreements is frozen): builds
-- before 2.1 keep sending it and keep working; 2.1 asks every rider to agree to version 2.
-- The text is app/src/core/rider-agreement.ts agreementText(), character for character;
-- app/src/core/__tests__/rider-agreement.test.ts fails if they ever differ.
insert into rider_agreements (version, title, body, body_sha256, effective_on)
select 2, 'Rider Safety and Liability Agreement', t, encode(sha256(convert_to(t, 'UTF8')), 'hex'), date '2026-11-06'
from (select $agreement_v2$Rider Safety and Liability Agreement (version 2, effective November 6, 2026)

OnMyLead is a tool to help your group keep track of each other. You are in charge of your own safety. Please read this and agree before you ride.

You Ride at Your Own Risk
Riding and driving, on or off road, alone or in a group, is dangerous and can lead to injury, death and damage to vehicles and property. You choose where, when and how you ride, and you voluntarily accept all of those risks, whether or not you use OnMyLead.

Never Use the App While Driving or Riding
Do not look at, type on or tap your phone while your vehicle is moving. Pull over and stop first, or let a passenger use the app. Mount your phone securely and set up your ride before you leave. Follow every law about phone use where you are.

Only Ride Where It Is Legal and Allowed
Maps, routes, trails, waypoints and directions in OnMyLead, including ones other riders share, can be wrong, out of date, closed, unsafe or on private land. It is your job to check that you are allowed to be there and that the way is safe, and to obey traffic laws, land-use rules, closures and signs.

OnMyLead Is Not an Emergency or Safety Service
Locations can be late, wrong or missing. Phones lose signal and batteries run out. Help, SOS and other alerts only reach riders in the app and may arrive late or not at all. Never rely on OnMyLead to keep you or anyone else safe. In an emergency, call 911 or your local emergency number.

Always Call 911 in an Emergency
The EMERGENCY button, Crash Alert, Need Help and the Emergency Siren only alert other riders on your ride who use OnMyLead. They do not call or text 911, police, fire, ambulance or any rescue service, and they can be late, missed or not work at all, for example with no signal, a dead battery or Bluetooth out of range. If you or anyone else is hurt, in danger or needs help, always call 911 or your local emergency number first, then use OnMyLead to tell your group.

You Are Responsible for What You Do
You are responsible for your own actions, for how you ride and drive, and for any accident, injury or damage you cause while using OnMyLead. Leading, following or joining a ride does not make the leader, other riders or OnMyLead responsible for your safety.

Release of Liability
To the fullest extent the law allows, you release RUS Offroad LLC, OnMyLead and their owners, employees and partners from all claims for injury, death, property damage or other loss that come from your riding or your use of the app, including claims about locations, routes, maps, directions or alerts. You agree they are not liable for those losses, and that you will cover any claim brought against them because of how you rode or used the app.

Age and the Terms of Use
If you are under 18, a parent or guardian must read and agree to this for you. This agreement is part of the OnMyLead Terms of Use, which also apply. If any part cannot be enforced where you live, the rest still applies. If you do not agree, do not use OnMyLead.

I have read and agree to the Rider Safety and Liability Agreement, I accept the risks of riding, and I will always call 911 in an emergency.$agreement_v2$ as t) s
on conflict (version) do nothing;
