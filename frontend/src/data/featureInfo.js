import {
  BarChart3, CalendarDays, Compass, Globe2, Leaf, MapPinned,
  ShieldAlert, Sparkles, WalletCards,
} from "lucide-react";

// One entry per feature route. `action` is the page's primary button; each
// one is replaced by the real primary action when its feature ships.
export const featureInfo = {
  "/app/inventory": { eyebrow:"YOUR PARTNER NETWORK", title:"Supplier inventory", description:"Explore stays, guides and experiences from the partners you trust.", icon:Compass, label:"Inventory explorer", action:{ label:"Explore destinations", to:"/home#discover" } },
  "/app/ai-studio": { eyebrow:"THOUGHTFUL BY DESIGN", title:"AI travel advisor", description:"Shape an itinerary around the way your travellers want to feel.", icon:Sparkles, label:"Planning canvas", action:{ label:"Choose a destination", to:"/home#discover" } },
  "/app/related-spots": { eyebrow:"DISCOVER MORE", title:"Related spots", description:"Find attractions and experiences connected to the destinations in your portfolio.", icon:MapPinned, label:"Destination discovery", action:{ label:"Browse destinations", to:"/home#discover" } },
  "/app/ai-operations": { eyebrow:"YOUR AGENCY COPILOT", title:"AI travel operations", description:"Work through group trips, supplier comparisons, quotations and itinerary planning with an AI assistant.", icon:Sparkles, label:"Operations assistant", action:{ label:"Explore inventory", to:"/app/inventory" } },
  "/app/packages": { eyebrow:"BUILD SOMETHING MEMORABLE", title:"Package builder", description:"Bring stays, transport and experiences together into one considered offer.", icon:WalletCards, label:"Package workspace", action:{ label:"Open itinerary studio", to:"/app/itinerary-studio" } },
  "/app/analytics": { eyebrow:"KNOW YOUR NUMBERS", title:"Profitability analysis", description:"Understand the shape and performance of your travel business.", icon:BarChart3, label:"Business insights", action:{ label:"Back to overview", to:"/app" } },
  "/app/forecast": { eyebrow:"LOOK A LITTLE FURTHER", title:"Demand forecasting", description:"Explore the signals shaping tomorrow's travel demand.", icon:CalendarDays, label:"Demand outlook", action:{ label:"Try the market simulator", to:"/app/simulator" } },
  "/app/simulator": { eyebrow:"WHAT IF?", title:"Market simulator", description:"Explore how changing conditions could shape the journeys you offer.", icon:Globe2, label:"Scenario workspace", action:{ label:"See demand forecast", to:"/app/forecast" } },
  "/app/anomalies": { eyebrow:"A CLOSER LOOK", title:"Anomaly watch", description:"Keep a considered eye on supplier rates and inventory changes.", icon:ShieldAlert, label:"Signals & changes", action:{ label:"Browse inventory", to:"/app/inventory" } },
  "/app/responsible-travel": { eyebrow:"TRAVEL WITH CARE", title:"Responsible travel", description:"Browse distinctive stays and estimate the footprint of your journey.", icon:Leaf, label:"Impact explorer", action:{ label:"Estimate your journey", to:"/app/responsible-travel#carbon-estimator" } },
  "/app/itinerary-studio": { eyebrow:"MADE IN YOUR SIGNATURE", title:"Itinerary studio", description:"Create polished, shareable journeys with your agency's own identity.", icon:MapPinned, label:"Your design studio", action:{ label:"Go to package builder", to:"/app/packages" } },
};
