const originalDestinations = [
  {
    slug: "dolomites-italy",
    name: "The Dolomites",
    country: "Italy",
    cardTitle: "Dolomites, Italy",
    type: "ALPINE ESCAPES",
    cardImage: "photo-1519681393784-d120267933ba",
    heroImage: "photo-1470770841072-f978cf4d019e",
    detail: "A quieter side of the Italian Alps",
    editorial: "Where limestone peaks catch the last light, and the path between villages is as memorable as the view.",
    bestTime: "June to September",
    highlights: ["Alpine trails and rifugi", "Lad in and Tyrolean culture", "Quiet lakeside mornings"],
    introduction: "The Dolomites reward a slower pace. Move between high meadows, small mountain towns and family-run rifugi, leaving time for long lunches and the changing light on the peaks.",
    geography: "A dramatic range in northeastern Italy, shaped by pale limestone towers, forested valleys and high alpine plateaus. Ladin, Italian and German traditions meet here.",
    duration: "5–8 days",
    tips: ["Reserve popular rifugi well ahead in peak summer.", "Pack layers; mountain weather can change quickly.", "Use local buses and lifts to link trailheads where possible."],
    attractions: [
      { name: "Lago di Braies", image: "photo-1500530855697-b586d89ba3ee", description: "A still alpine lake framed by forest and steep limestone walls.", category: "LANDSCAPE", location: "Pragser Tal", duration: "2–3 hours" },
      { name: "Tre Cime di Lavaredo", image: "photo-1519681393784-d120267933ba", description: "Three unmistakable peaks above a high circular walking route.", category: "HIKING", location: "Sexten Dolomites", duration: "4–6 hours" },
      { name: "Alpe di Siusi", image: "photo-1464822759023-fed622ff2c3b", description: "Wide flower meadows and mountain views across Europe's largest high alpine pasture.", category: "OUTDOORS", location: "South Tyrol", duration: "Half day" },
    ],
    experiences: ["Join a Ladin cook for a small-group kitchen visit.", "Walk with an independent mountain guide on a locally chosen trail.", "Visit a family-run dairy and learn about alpine cheese-making.", "Spend a night at a rifugio and wake above the valley."],
    responsible: "Look for locally owned guesthouses, certified mountain guides and family-run rifugi. Travel by regional rail and valley buses where practical, and follow marked trails to protect fragile alpine meadows.",
    related: ["kyoto-japan", "marrakech-morocco"],
  },
  {
    slug: "kyoto-japan",
    name: "Kyoto",
    country: "Japan",
    cardTitle: "Kyoto, Japan",
    type: "CULTURE & CRAFT",
    cardImage: "photo-1493976040374-85c8e12f0c0e",
    heroImage: "photo-1493976040374-85c8e12f0c0e",
    detail: "Tradition, revealed one lane at a time",
    editorial: "In Kyoto, the most rewarding discoveries are often found in the quiet spaces between its celebrated landmarks.",
    bestTime: "March to May · October to November",
    highlights: ["Temple gardens and hillside shrines", "Seasonal kaiseki and market food", "Craft studios in historic lanes"],
    introduction: "Kyoto asks to be explored on foot, early in the day and with curiosity. Give its neighbourhoods room to unfold: a temple garden, a small workshop and a conversation over tea can make a day feel complete.",
    geography: "Set in a broad basin ringed by forested hills, Kyoto is threaded by the Kamo River and shaped by distinct neighbourhoods, temple precincts and traditional machiya streets.",
    duration: "4–6 days",
    tips: ["Visit popular sites early or later in the afternoon.", "Keep voices low and follow photography guidance at shrines and temples.", "Use local buses and trains, and walk within neighbourhoods."],
    attractions: [
      { name: "Fushimi Inari Shrine", image: "photo-1478436127897-769e1b3f0f36", description: "A hillside shrine path lined with thousands of vermilion torii gates.", category: "SHRINE", location: "Fushimi", duration: "2–3 hours" },
      { name: "Arashiyama Bamboo Grove", image: "photo-1528360983277-13d401cdc186", description: "A much-loved bamboo path best experienced in the quiet of early morning.", category: "LANDSCAPE", location: "Arashiyama", duration: "1–2 hours" },
      { name: "Kinkaku-ji", image: "photo-1493976040374-85c8e12f0c0e", description: "The Golden Pavilion reflected in a carefully composed garden pond.", category: "TEMPLE", location: "Kita Ward", duration: "1–1.5 hours" },
      { name: "Gion District", image: "photo-1528360983277-13d401cdc186", description: "Historic lanes, wooden teahouses and a living arts district; visit respectfully.", category: "NEIGHBOURHOOD", location: "Higashiyama", duration: "2 hours" },
      { name: "Nishiki Market", image: "photo-1555939594-58d7cb561ad1", description: "A narrow covered market introducing Kyoto ingredients and everyday food culture.", category: "FOOD", location: "Central Kyoto", duration: "1–2 hours" },
    ],
    experiences: ["Share a seasonal home-style meal with a local host.", "Join a small-group walk with an independent neighbourhood guide.", "Learn the basics of tea preparation in a traditional setting.", "Meet a local craftsperson in a private pottery or textile studio."],
    responsible: "Choose locally run machiya stays and independent guides, support small craft studios and family-owned restaurants, and keep residential lanes peaceful. Treat geiko and maiko as working professionals; never block or photograph them without consent.",
    related: ["dolomites-italy", "marrakech-morocco"],
  },
  {
    slug: "marrakech-morocco",
    name: "Marrakech",
    country: "Morocco",
    cardTitle: "Marrakech, Morocco",
    type: "DESERT & DESIGN",
    cardImage: "photo-1539020140153-e479b8c22e70",
    heroImage: "photo-1539020140153-e479b8c22e70",
    detail: "A sensory journey through the medina",
    editorial: "Let the medina set the pace: a turn down a quiet lane can lead to a courtyard, a workshop or a table worth lingering over.",
    bestTime: "March to May · September to November",
    highlights: ["Historic medina and gardens", "Independent artisans and design", "Shared meals and spice markets"],
    introduction: "Marrakech is a city of courtyards, craft and contrast. Build a little breathing room into each day and let a trusted local guide help you look beyond the busiest routes.",
    geography: "At the edge of the Haouz plain and within view of the High Atlas, Marrakech's old medina sits beside newer neighbourhoods, gardens and lively markets.",
    duration: "3–5 days",
    tips: ["Spring and autumn are comfortable seasons for exploring on foot.", "Ask before photographing people and shop interiors.", "Agree on a price before accepting a taxi ride or guided service."],
    attractions: [
      { name: "Jemaa el-Fnaa", image: "photo-1539020140153-e479b8c22e70", description: "A historic central square whose atmosphere changes through the day.", category: "SQUARE", location: "Medina", duration: "1–2 hours" },
      { name: "Bahia Palace", image: "photo-1512813195386-6cf811ad3542", description: "A nineteenth-century palace known for intricate tilework and shaded courtyards.", category: "ARCHITECTURE", location: "Mellah", duration: "1–2 hours" },
      { name: "Jardin Majorelle", image: "photo-1497250681960-ef046c08a56e", description: "A carefully designed garden of bold colour, cacti and quiet paths.", category: "GARDEN", location: "Guéliz", duration: "1–1.5 hours" },
    ],
    experiences: ["Explore the medina with an independent, locally based guide.", "Join a small cooking workshop focused on seasonal Moroccan dishes.", "Visit an artisan cooperative and learn about traditional craft techniques.", "Share mint tea and a home-cooked meal with a local host."],
    responsible: "Choose locally owned riads, independent guides and cooperatives that pay artisans fairly. Ask permission before taking photographs, shop directly from makers where possible and seek experiences led by community businesses.",
    related: ["dolomites-italy", "kyoto-japan"],
  },
];

const additionalDestinations = [
  {
    slug: "kashmir-india", name: "Kashmir", country: "India", cardTitle: "Kashmir, India", type: "MOUNTAINS & LAKES", cardImage: "photo-1500534623283-312aade485b7", heroImage: "photo-1501785888041-af3ef285b470", detail: "Mountain mornings, shikara evenings",
    editorial: "A landscape of cedar forests, mountain lakes and old neighbourhoods, best discovered at a pace that leaves room to pause.", bestTime: "March to October", highlights: ["Dal Lake and its houseboats", "Mughal-era gardens", "Pahalgam's pine valleys"], introduction: "Kashmir's valley towns and high mountain scenery invite a varied journey: time on the water, walks through historic gardens and slower days among the foothills.", geography: "The Kashmir Valley is framed by the Pir Panjal and Himalayan ranges, with rivers, lakes and orchards shaping its towns and countryside.", duration: "5–8 days", tips: ["Check current local travel guidance before departure.", "Ask before photographing residents or private gardens.", "Allow extra time for mountain roads and changing conditions."],
    attractions: [
      { name: "Dal Lake", image: "photo-1501785888041-af3ef285b470", description: "A broad lake edged by gardens, houseboats and the old city of Srinagar.", category: "LAKE", location: "Srinagar", duration: "Half day" },
      { name: "Nishat Bagh", image: "photo-1599661046827-dacff0c0f09a", description: "Terraced Mughal gardens with views toward Dal Lake and the surrounding hills.", category: "GARDEN", location: "Srinagar", duration: "1–2 hours" },
      { name: "Pahalgam Valley", image: "photo-1500530855697-b586d89ba3ee", description: "A mountain town and river valley surrounded by forested slopes.", category: "OUTDOORS", location: "Anantnag district", duration: "Full day" },
    ], experiences: ["Take a locally guided walk through Srinagar's old quarters.", "Meet a papier-mâché or carpet artisan in their workshop.", "Share a home-style wazwan meal with a local host."], responsible: "Choose locally owned stays and registered independent guides. Buy directly from artisans, agree on prices clearly and follow local advice around sensitive sites and photography.", related: ["ladakh-india", "udaipur-india"],
  },
  {
    slug: "jaipur-india", name: "Jaipur", country: "India", cardTitle: "Jaipur, India", type: "CRAFT & HERITAGE", cardImage: "photo-1598974357801-cbca100e65d3", heroImage: "photo-1599661046827-dacff0c0f09a", detail: "A pink city made for looking closer",
    editorial: "Behind Jaipur's rose-coloured facades are observatories, courtyards and generations of living craft.", bestTime: "October to March", highlights: ["Amber Fort and hilltop views", "City Palace courtyards", "Block printing and blue pottery"], introduction: "Jaipur pairs monumental architecture with everyday workshop life. Leave time between landmark visits to meet makers and explore the older lanes on foot.", geography: "The walled city sits on the edge of Rajasthan's semi-arid Aravalli hills, with forts on nearby ridgelines and newer districts beyond its historic gates.", duration: "3–4 days", tips: ["Start outdoor sightseeing early in the day.", "Use a licensed local guide at historic sites.", "Ask permission before photographing artisans at work."],
    attractions: [
      { name: "Amber Fort", image: "photo-1598974357801-cbca100e65d3", description: "A hilltop fort complex of courtyards, gateways and mirrored halls.", category: "FORT", location: "Amer", duration: "2–3 hours" },
      { name: "Hawa Mahal", image: "photo-1477587458883-47145ed94245", description: "The honeycomb facade of Jaipur's celebrated Palace of Winds.", category: "ARCHITECTURE", location: "Badi Chaupar", duration: "1 hour" },
      { name: "Jantar Mantar", image: "photo-1587974928442-77dc3e0dba72", description: "An astronomical observatory with monumental stone instruments.", category: "HERITAGE", location: "Old City", duration: "1–2 hours" },
    ], experiences: ["Learn block printing in a small artisan studio.", "Explore the old city with an independent heritage guide.", "Join a family-run kitchen for a Rajasthani cooking session."], responsible: "Support small workshops and family-run eateries directly. Choose locally owned accommodation, use registered guides and keep visits respectful in active religious spaces.", related: ["udaipur-india", "kashmir-india"],
  },
  {
    slug: "udaipur-india", name: "Udaipur", country: "India", cardTitle: "Udaipur, India", type: "LAKESIDE HERITAGE", cardImage: "photo-1587974928442-77dc3e0dba72", heroImage: "photo-1477587458883-47145ed94245", detail: "Courtyards and lake light in Rajasthan",
    editorial: "Udaipur's old lanes rise above the water, where palace stone, local markets and evening light meet.", bestTime: "October to March", highlights: ["City Palace and its galleries", "Lake Pichola at dusk", "Hand-painted miniature art"], introduction: "Give Udaipur a few unhurried days. Move between lakeside ghats, small museums and workshops, and leave time for the city as the evening lamps come on.", geography: "Set among the Aravalli hills in southern Rajasthan, Udaipur is known for its interconnected lakes, old-city lanes and palace architecture.", duration: "3–4 days", tips: ["Visit popular lakeside sites early or toward evening.", "Respect private waterfront homes and active ghats.", "Carry water and plan for warm afternoons outside winter."],
    attractions: [
      { name: "City Palace", image: "photo-1587974928442-77dc3e0dba72", description: "A layered palace complex overlooking Lake Pichola and the old city.", category: "PALACE", location: "City Palace Road", duration: "2–3 hours" },
      { name: "Lake Pichola", image: "photo-1501785888041-af3ef285b470", description: "A city lake surrounded by ghats, palaces and the Aravalli foothills.", category: "LAKE", location: "Old City", duration: "1–2 hours" },
      { name: "Jagdish Temple", image: "photo-1598974357801-cbca100e65d3", description: "A richly carved historic temple in the heart of the old city.", category: "TEMPLE", location: "Jagdish Chowk", duration: "1 hour" },
    ], experiences: ["Meet a miniature painter in a family-run studio.", "Take an evening walk with an independent old-city guide.", "Share a seasonal Mewari meal at a locally owned home or kitchen."], responsible: "Prioritize locally owned guesthouses, independent guides and small craft studios. Ask before photographing people or private spaces, and keep lakeside areas free of litter.", related: ["jaipur-india", "kerala-india"],
  },
  {
    slug: "kerala-india", name: "Kerala", country: "India", cardTitle: "Kerala, India", type: "BACKWATERS & SPICE", cardImage: "photo-1593693411515-c20261bcad6e", heroImage: "photo-1602216056096-3b40cc0c9944", detail: "A softer rhythm along India's southwest coast",
    editorial: "Follow waterways through the green heart of Kerala, then return to the coast for food, craft and salt air.", bestTime: "October to March", highlights: ["Kochi's port-side heritage", "Alappuzha backwaters", "Munnar's highland tea country"], introduction: "Kerala is best experienced across several landscapes: a historic port, a locally operated backwater journey and the cooler hill country where tea gardens follow the slopes.", geography: "India's southwestern coast stretches from the Arabian Sea to the Western Ghats, with lagoons, rivers, forest and highland plantations.", duration: "6–9 days", tips: ["Choose small, locally operated boats for backwater trips.", "Pack for humid coastal weather and cooler highlands.", "Ask before photographing communities and working landscapes."],
    attractions: [
      { name: "Fort Kochi", image: "photo-1593693411515-c20261bcad6e", description: "A port-side neighbourhood shaped by trading history and living arts.", category: "NEIGHBOURHOOD", location: "Kochi", duration: "Half day" },
      { name: "Alappuzha Backwaters", image: "photo-1602216056096-3b40cc0c9944", description: "A network of canals and lagoons best explored with a locally run boat operator.", category: "WATERWAYS", location: "Alappuzha", duration: "Half to full day" },
      { name: "Munnar Tea Country", image: "photo-1544735716-392fe2489ffa", description: "Highland roads and tea-covered slopes in the Western Ghats.", category: "HIGHLANDS", location: "Idukki district", duration: "Full day" },
    ], experiences: ["Join a family kitchen for a Kerala-style meal.", "Take a small-group heritage walk in Fort Kochi.", "Visit a working spice garden with a local grower."], responsible: "Use locally operated boats and homestays, choose guides from the communities you visit and seek consent before photographing workers or village life.", related: ["meghalaya-india", "udaipur-india"],
  },
  {
    slug: "ladakh-india", name: "Ladakh", country: "India", cardTitle: "Ladakh, India", type: "HIGH HIMALAYA", cardImage: "photo-1500530855697-b586d89ba3ee", heroImage: "photo-1519681393784-d120267933ba", detail: "High passes and a slower mountain pace",
    editorial: "In Ladakh, stark high-altitude landscapes sit alongside village life, monastery courtyards and long quiet roads.", bestTime: "May to September", highlights: ["Leh's old town and palace", "Nubra Valley's high desert", "Monastery and village visits"], introduction: "Ladakh rewards gradual acclimatization and a generous itinerary. Spend time around Leh before crossing high passes, and make room for locally hosted stays beyond the main road.", geography: "A high-altitude region on the Tibetan Plateau's western edge, shaped by the Indus River, stark mountains and dispersed settlements.", duration: "6–9 days", tips: ["Acclimatize in Leh before travelling to higher elevations.", "Check local road and weather conditions before each transfer.", "Dress respectfully at monasteries and ask before taking photographs."],
    attractions: [
      { name: "Leh Palace", image: "photo-1500530855697-b586d89ba3ee", description: "A former royal palace with views across Leh and the Indus valley.", category: "HERITAGE", location: "Leh", duration: "1–2 hours" },
      { name: "Nubra Valley", image: "photo-1519681393784-d120267933ba", description: "A high mountain valley of villages, river plains and desert landscapes.", category: "VALLEY", location: "Nubra", duration: "1–2 days" },
      { name: "Thiksey Monastery", image: "photo-1531366936337-7c912a4589a7", description: "A hillside monastery complex overlooking the Indus Valley.", category: "MONASTERY", location: "Thiksey", duration: "1–2 hours" },
    ], experiences: ["Stay with a locally owned family guesthouse.", "Walk with an independent mountain guide on a suitable acclimatization route.", "Learn about local foodways in a small home kitchen."], responsible: "Travel slowly to reduce strain at altitude, choose local guides and homestays, conserve water and follow community guidance around sacred places.", related: ["kashmir-india", "dolomites-italy"],
  },
  {
    slug: "meghalaya-india", name: "Meghalaya", country: "India", cardTitle: "Meghalaya, India", type: "FOREST & WATERFALLS", cardImage: "photo-1464822759023-fed622ff2c3b", heroImage: "photo-1544735716-392fe2489ffa", detail: "Rainforest paths and living root bridges",
    editorial: "Meghalaya's hills hold rain-fed waterfalls, cave systems and remarkable bridges grown slowly from living roots.", bestTime: "October to April", highlights: ["Living root bridges", "Shillong's music and food", "Waterfalls and limestone caves"], introduction: "Meghalaya offers a rewarding mix of town life and outdoor exploration. Go with local guides on village and forest trails, and allow weather to shape each day's plan.", geography: "A plateau in India's northeast bordered by Assam and Bangladesh, with forested hills, deep valleys and some of the region's heaviest seasonal rains.", duration: "5–7 days", tips: ["Seasonal rain can affect trail and road access.", "Use local guides for caves, rivers and village routes.", "Carry out waste and follow community rules at living root bridges."],
    attractions: [
      { name: "Living Root Bridges", image: "photo-1544735716-392fe2489ffa", description: "Hand-guided bridges formed over generations from living tree roots.", category: "COMMUNITY HERITAGE", location: "Khasi Hills", duration: "Half to full day" },
      { name: "Dawki River", image: "photo-1501785888041-af3ef285b470", description: "A clear river valley on the Bangladesh border, best visited with local guidance.", category: "RIVER", location: "West Jaintia Hills", duration: "Half day" },
      { name: "Shillong", image: "photo-1500530855697-b586d89ba3ee", description: "A hill city with a distinct music scene, markets and nearby viewpoints.", category: "CITY", location: "East Khasi Hills", duration: "1–2 days" },
    ], experiences: ["Walk with a community-based guide to a root bridge.", "Share Khasi food with a locally hosted kitchen.", "Visit a small music venue or craft workshop in Shillong."], responsible: "Book community-based guides, respect village access and bridge-care contributions, and leave fragile forest and river areas without litter.", related: ["kerala-india", "ladakh-india"],
  },
  {
    slug: "bali-indonesia", name: "Bali", country: "Indonesia", cardTitle: "Bali, Indonesia", type: "ISLAND CULTURE", cardImage: "photo-1544644181-1484b3fdfc62", heroImage: "photo-1537996194471-e657df975ab4", detail: "Island days shaped by ritual and craft",
    editorial: "Bali's temples, villages and coastlines reward travellers who slow down and follow local rhythms.", bestTime: "April to October", highlights: ["Ubud's craft and food culture", "Village temples and water landscapes", "Quiet stretches of coast"], introduction: "Balance Bali's popular coastal areas with inland villages and locally guided experiences. Plan around ceremonies respectfully and choose transport and stays that support neighbourhood businesses.", geography: "A volcanic island in Indonesia's Lesser Sunda chain, shaped by terraced highlands, dense settlements and a varied southern coastline.", duration: "5–8 days", tips: ["Check ceremony etiquette with your local host or guide.", "Wear appropriate clothing at temples and follow posted guidance.", "Allow for traffic when planning cross-island journeys."],
    attractions: [
      { name: "Ubud", image: "photo-1537996194471-e657df975ab4", description: "An inland centre for craft, food and arts, surrounded by village landscapes.", category: "TOWN", location: "Gianyar Regency", duration: "1–2 days" },
      { name: "Tegallalang Rice Terraces", image: "photo-1544644181-1484b3fdfc62", description: "A cultivated hillside landscape best explored with respect for local farming life.", category: "LANDSCAPE", location: "North of Ubud", duration: "1–2 hours" },
      { name: "Uluwatu Temple", image: "photo-1507525428034-b723cf961d3e", description: "A clifftop temple site with broad views over the Indian Ocean.", category: "TEMPLE", location: "Bukit Peninsula", duration: "1–2 hours" },
    ], experiences: ["Join a small cooking class led by a local family.", "Meet a woodcarver or textile maker in their studio.", "Take a village walk with an independent Balinese guide."], responsible: "Support locally owned stays and guides, dress respectfully at temples, avoid single-use plastics and ask before photographing ceremonies or residents.", related: ["kerala-india", "amalfi-coast-italy"],
  },
  {
    slug: "iceland", name: "Iceland", country: "Iceland", cardTitle: "Iceland", type: "NORTH ATLANTIC", cardImage: "photo-1504829857797-ddff29c27927", heroImage: "photo-1470770841072-f978cf4d019e", detail: "Open horizons and volcanic landscapes",
    editorial: "Iceland's elemental landscapes invite a road journey shaped by weather, daylight and careful choices.", bestTime: "June to September · winter for aurora", highlights: ["Reykjavík's design and food", "Geothermal landscapes", "Coastal and highland scenery"], introduction: "Build flexibility into an Iceland itinerary. Weather, daylight and road conditions change by season, so choose a few regions to explore rather than trying to cover the whole island at once.", geography: "A North Atlantic island of volcanic plateaus, glaciers, geothermal areas and long stretches of sparsely settled coastline.", duration: "6–10 days", tips: ["Check road and weather conditions before each drive.", "Stay on marked paths around fragile landscapes.", "Use locally owned guesthouses and certified guides where possible."],
    attractions: [
      { name: "Þingvellir National Park", image: "photo-1504829857797-ddff29c27927", description: "A rift valley of geological and cultural significance within the Golden Circle.", category: "NATIONAL PARK", location: "Southwest Iceland", duration: "2–3 hours" },
      { name: "Reynisfjara Coast", image: "photo-1500530855697-b586d89ba3ee", description: "A dramatic black-sand coast; observe posted wave-safety guidance.", category: "COAST", location: "South Coast", duration: "1 hour" },
      { name: "Reykjavík", image: "photo-1524231757912-21f4fe3a7200", description: "A compact capital of independent food, design and waterfront walks.", category: "CITY", location: "Capital Region", duration: "1–2 days" },
    ], experiences: ["Take a small-group walk with a local naturalist.", "Visit a community-run geothermal pool.", "Meet a Reykjavík food maker on a neighbourhood tasting walk."], responsible: "Stay on marked routes, respect seasonal closures, reduce driving where possible and choose locally owned stays and guides.", related: ["dolomites-italy", "ladakh-india"],
  },
  {
    slug: "amalfi-coast-italy", name: "Amalfi Coast", country: "Italy", cardTitle: "Amalfi Coast, Italy", type: "COASTAL ITALY", cardImage: "photo-1523906834658-6e24ef2386f9", heroImage: "photo-1516483638261-f4dbaf036963", detail: "A coast best explored between the famous turns",
    editorial: "Look beyond the postcard viewpoints to find quieter footpaths, family kitchens and small coastal towns.", bestTime: "April to June · September to October", highlights: ["Amalfi's cathedral and lanes", "The Path of the Gods", "Local citrus and seafood"], introduction: "The Amalfi Coast is a place to move slowly. Combine a few towns with time on foot, travel by ferry where possible and leave breathing room between the well-known viewpoints.", geography: "A steep Mediterranean coastline south of Naples, where villages, terraced gardens and small harbours cling to the Lattari Mountains.", duration: "4–6 days", tips: ["Book stays and ferries well ahead in peak season.", "Use ferries or public buses to reduce road congestion.", "Wear sturdy shoes on steep lanes and coastal paths."],
    attractions: [
      { name: "Amalfi Town", image: "photo-1523906834658-6e24ef2386f9", description: "A historic maritime town with a cathedral, small piazzas and harbour life.", category: "TOWN", location: "Amalfi", duration: "Half day" },
      { name: "Path of the Gods", image: "photo-1516483638261-f4dbaf036963", description: "A high coastal footpath with wide views; check local trail conditions first.", category: "HIKING", location: "Agerola to Nocelle", duration: "3–5 hours" },
      { name: "Ravello", image: "photo-1500534623283-312aade485b7", description: "A hilltop town known for gardens, music and sweeping coastal views.", category: "HILLSIDE TOWN", location: "Ravello", duration: "Half day" },
    ], experiences: ["Join a family-run lemon grove visit and tasting.", "Walk with a local guide through lesser-known coastal lanes.", "Learn regional recipes in a small home kitchen."], responsible: "Choose locally owned stays, use public ferries and buses where practical, and support independent guides, growers and family businesses.", related: ["dolomites-italy", "marrakech-morocco"],
  },
];

export const destinations = [...originalDestinations, ...additionalDestinations];

export const getDestination = (slug) => destinations.find((destination) => destination.slug === slug);
