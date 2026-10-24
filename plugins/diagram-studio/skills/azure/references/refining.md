# Refining: from request to spec edit

People ask for changes in visual words. The spec only carries meaning, so translate each request into the field that produces it. Edit only those fields, render, and say what you changed. Field details are in `diagram-studio docs azure-architecture` and `diagram-studio docs spec-format`.

## Steps and flows

| The user says | Edit |
| --- | --- |
| "Number the steps", "add the flow" | `step` on flows (in reading order, `1a`/`1b` for parallel branches), plus one sentence per number in `steps`. Every number needs its sentence |
| "Two flows: inbound and outbound", "show reads and writes" | `flowTypes` with one entry per flow, and `type` on each flow. Colours, badge shapes and the legend follow |
| "Put the steps underneath", "no workflow box" | `"workflow": "bottom"` or `"none"` (the steps stay in the PowerPoint speaker notes) |
| "That line is the main path", "the rest is secondary" | `"style": "dashed"` or `"dotted"` on the secondary flows or their flow type. Lines stay black unless `flowTypes` explains a colour |
| "Show the DNS links", "show the peering" | DNS zone links: `"style": "dotted", "arrows": "none", "label": "Linked"`. Peering: `"arrows": "both", "style": "dashed", "label": "Peering"` |
| "Label that line" | `label` on the flow, up to 40 characters; keep it to a protocol or a verb ("HTTPS", "Reads") |

## Network structure

| The user says | Edit |
| --- | --- |
| "Show the subnets", "add NSGs" | Wrap services in `"boundary": "subnet"` containers inside the `virtual-network`; `"nsg": true` on each subnet that has one |
| "Add private endpoints" | A `subnet` with one `private-endpoint` node per service, placed last in the VNet's row. Add an invisible column of the services beside the VNet, in the same order, with a flow from each endpoint to its service |
| "Zone redundant" | Three `zone` boundaries ("Zone 1", "Zone 2", "Zone 3") each holding an instance, or a `description` such as "Zone-redundant, 3 instances" |
| "Add the hub", "hub and spoke" | Two `virtual-network` boundaries in a row ("Hub", "Spoke") with a peering flow between them |
| "Second region", "multi-region" | An invisible `column` of two `region` boundaries with the same structure, global services (Front Door) to their left, a `group` of shared resources to their right |
| "Show what happens if a region fails" | A new concept: the same topology with `"emphasis": "muted"` on the failed region and the failover path numbered |
| "Add monitoring", "where do logs go?" | A `"boundary": "group"` labelled "Monitoring" (Azure Monitor, Log Analytics, Application Insights), usually without flows. Never wire Log Analytics to every service |
| "Show the address space", "which SKU?" | `description` on the boundary or node, only with the values the user gave you |
| "Show what's on-premises" | An `"boundary": "on-premises"` container, joined by the VPN or ExpressRoute gateway the user named |

## Emphasis and focus

| The user says | Edit |
| --- | --- |
| "Make X stand out", "the focus is X" | `"emphasis": "accent"` on that service or boundary. At `executive` at most two elements are accented, counting boundaries, so take the accent off whatever had it. Check the title still matches the new focus |
| "And Y as well, but less" | `"emphasis": "highlight"` on Y |
| "Y is just context", "grey out the old one" | `"emphasis": "muted"` |
| "X is new", "Y is being retired", "Z is at risk" | `"status"` on that node (`new`, `changed`, `retired`, `at-risk`), only because the user said so |
| "Add the so-what" | `callout.text`. Without an `anchor` it is a bar under the diagram, which suits a wide architecture best; with one it sits in a side column level with that element |
| "The title is weak", "punchier" | Rewrite `title` as a finding in under 90 characters, using only the user's facts. Offer two options if it changes the claim |

## Amount of detail

| The user says | Edit |
| --- | --- |
| "Too busy", "simplify" | Drop the supporting services, collapse subnets into their virtual network, move detail into `description`s, raise it to a solution workflow, or split it into one diagram per region or per story |
| "Needs more detail", "for the engineers" | `"altitude": "detailed"`, then add the subnets, NSGs, endpoints and zones the user or the deployment gives you. Ask; do not invent |
| "Text is too small" | There is no font-size field. When the canvas grew to fit (the render notes say so), labels print smaller on a slide: reduce services, group them, or split the diagram |

## Layout

| The user says | Edit |
| --- | --- |
| "Swap the order", "put the gateway first" | Reorder `children`. Flows read left to right: users and clients, then edge services, then workloads, then data |
| "Move this box over there" | Positions are not free: the engine lays out from structure. Offer the structural change that gets close (reorder, a different container, `"layout": "column"` or `"grid"`) |
| "Stack these", "it's too wide" | `"layout": "column"` or `"grid"` (with `columns`) on the container that holds them |
| "Lines cross", "that line goes through the subnet" | Reorder children so connected services sit side by side; list PaaS services in the same order as their private endpoints |
| "For the wiki", "no title on the picture" | `"frame": "figure"` |
| "For a document", "portrait" | `"canvas": { "aspect": "A4-landscape" }` (or `A4-portrait`) |
| "Let it grow", "it doesn't fit" | `"canvas": { "aspect": "auto" }`, for engineers' diagrams and documents only; slides stay 16:9 |

## Icons and names

| The user says | Edit |
| --- | --- |
| "Use our names", "call it the Orders API" | `label` on the node, keeping the product recognisable; put the service name in `description` if the icon alone is ambiguous |
| "Wrong icon" | `diagram-studio azure icons <words>` and change `service`. Never use an Azure icon for a non-Azure thing |
| "Add our on-premises system", "add the SaaS app" | A generic participant (`on-premises`, `third-party`, `client`, `device`) or a node without `service` (a plain box) |
| "Entra ID is missing" | The icon pack has no Entra ID icon. The user can save Microsoft's official Entra SVG as `entra-id.svg` in the `azure-icons` folder inside the engine's user folder (`diagram-studio version` prints it), and `"service": "entra-id"` then works. Until then, use `managed-identities` or `users` where that is what is meant |

## Look and feel

| The user says | Edit |
| --- | --- |
| "For the leadership deck" | `"theme": "boardroom"` (the `azure` theme stays the default) |
| "Black and white", "for printing" | `"theme": "print"` |
| "Put it in our brand" | `diagram-studio theme create --from-brand --id <id> --colors "#accent,#second" [--font "Name"]`, then `"theme": "<id>"`. Pass on the notes it prints |
| "Make that box blue", "recolour the icon" | Icons are never recoloured, and boxes have no colour field. Colour carries meaning: offer `accent`, `highlight`, `muted`, or a flow type |

A theme switch keeps the structure, but service cells are sized from labels in the theme's font, so the diagram may grow a little. Re-check the preview after switching.
