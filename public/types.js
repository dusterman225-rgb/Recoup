// The twelve business profiles. A profile only changes which tabs show and which purchase notes appear. Owners can ignore it.
export const TYPES = [
  ["electrician","Electrician",1,"Cable, breakers, boxes, fixtures, power tools, test equipment","Cable per foot, breakers by rating, tools by battery platform","Check ratings, safety listings and code compliance. Never swap protective devices on price alone."],
  ["plumber","Plumber",1,"Pipe, fittings, valves, fixtures, water heaters, sealants","Fittings per unit and per box, fixtures by model","Check pipe material, pressure rating and code. Never swap safety valves on price alone."],
  ["hvac","HVAC technician",1,"Equipment, refrigerant, ductwork, filters, thermostats, line sets","Equipment by model and efficiency rating, refrigerant per pound, filters per case","Equipment must match the sizing and efficiency spec. Refrigerant needs certified handling."],
  ["general-contractor","General contractor",1,"Lumber, drywall, concrete, fasteners, rentals, subcontractor invoices","Material per unit, delivery fees, subcontractor bids against each other","Structural and code-rated materials must meet the specified grade."],
  ["carpenter","Carpenter",1,"Lumber, sheet goods, hardware, fasteners, adhesives, blades","Lumber per board foot, sheet goods per sheet, fasteners per box","Grade, species and moisture must match the spec."],
  ["roofer","Roofer",1,"Shingles, underlayment, flashing, nails, dumpsters, safety gear","Shingles per square, underlayment per roll, dumpster and delivery fees","Check manufacturer warranty requirements and wind or weather ratings."],
  ["painter","Painter",1,"Paint, primer, sundries, brushes, rollers, spray supplies","Paint cost per gallon and per area covered","The product must suit the surface and finish, and meet any low-emission rules."],
  ["flooring","Flooring installer",1,"Flooring, underlayment, adhesive, trim, blades","Price per square foot including a waste allowance, adhesive per unit","The product must suit the subfloor and moisture conditions, and batches must match."],
  ["landscaper","Landscaper",1,"Plants, mulch, soil, stone, fuel, equipment parts, chemicals","Bulk material per cubic yard or ton, fuel cost per job","Chemicals and pesticides need licensed products, and plants must suit the climate."],
  ["masonry-concrete","Masonry and concrete",1,"Concrete, mortar, block, brick, rebar, forms, rentals","Concrete per cubic yard including delivery, block per unit, rental days","Strength rating and mix must match the spec, and curing conditions matter."],
  ["restaurant","Restaurant",0,"Produce, meat, dairy, dry goods, packaging, cleaning supplies","Price per pound or case at each distributor, weekly price trends","Check food safety, allergens, specifications and supplier certifications."],
  ["retail","Retail",0,"Stock for resale, packaging, shelving, shipping supplies","Wholesale cost per unit, minimum orders, shipping, the same product across distributors","Check product safety, authenticity and return terms."]
].map(([id,label,job,purchases,compare,caution]) => ({id,label,jobBased:!!job,purchases,compare,caution}));
export const typeOf = id => TYPES.find(t => t.id === id) || null;

