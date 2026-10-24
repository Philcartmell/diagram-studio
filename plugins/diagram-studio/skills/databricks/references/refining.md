# Refining: from request to spec edit

People ask for changes in visual words. The spec only carries meaning, so translate each request into the field that produces it. Edit only those fields, render, and say what you changed. Field details are in `diagram-studio docs databricks-architecture` and `diagram-studio docs azure-architecture` (the shared body fields).

## Flows and steps

| The user says | Edit |
| --- | --- |
| "Number the path", "add the flow" | `step` on flows in reading order (`1a`/`1b` for parallel branches), plus one sentence per number in `steps` |
| "Show the batch and the streaming path", "add the AI path" | `flowTypes` with one entry per path, and `type` on each flow. The first path is amber, the second blue, with a legend |
| "Put the steps underneath", "no workflow box" | `"workflow": "bottom"` or `"none"` (the steps stay in the PowerPoint speaker notes) |
| "Show it goes both ways" (storage reads and writes) | `"arrows": "both"` on that flow |
| "Label that line" | `label` on the flow, up to 40 characters ("CDC", "Reads") |
| "Show the permissions" | Unity Catalog privileges on the arrows (`USE CATALOG`, `READ FILES`, `EXECUTE`); cloud roles in the target's `description` |
| QA: a label or step "has no clear spot" | The arrow is too short: put its two ends side by side, or move the step to a longer arrow in the same chain |

## Structure

| The user says | Edit |
| --- | --- |
| "Add the medallion layers" | `bronze`, `silver` and `gold` boundaries in a `row`, inside the Transform `stage` (or a Store `group`), each holding its tables as plain boxes, joined left to right |
| "Show the stages", "swim lanes" | A `row` of `stage` boundaries named by the user (Sources, Ingest, Transform, Serve, Analyse by default) |
| "Add governance", "where does Unity Catalog fit?" | A `unity-catalog` boundary under the stages (root `column`), holding what it governs (lineage, quality monitoring, sharing). Never wire it to every table |
| "Show who runs what", "control plane", "serverless" | A `databricks-account` holding `plane`s (Control plane, Serverless compute plane) beside a `cloud-account` holding the Classic compute plane and Workspace storage |
| "Our network", "VNet injection", "Private Link" | Inside the `cloud-account`: a `virtual-network` with a host and a container `subnet` (`"nsg": true`) and a private endpoint subnet. For an Azure-centred picture, hand over to `/diagram-studio:azure` |
| "Dev, test and prod workspaces" | Three `workspace` boundaries in a row, named by environment, sharing a height |
| "The whole platform", "our capability map" | A `platform` boundary holding `panel`s (named workload areas) above a `unity-catalog` panel, with Sources and Analyse `stage`s either side |
| "Too busy" | Drop supporting products, merge layers into one Transform stage, raise to a single use-case flow, or split the topology and the flow into two diagrams |
| "Needs more detail", "for the engineers" | `"altitude": "detailed"`, then add what the user gives you (networking, workspaces, tables). Ask; do not invent |

## Emphasis and focus

| The user says | Edit |
| --- | --- |
| "Make X stand out", "the focus is X" | `"emphasis": "accent"` on that product or boundary (lava). At `executive` at most two elements are accented, counting boundaries. Check the title still matches the new focus |
| "And Y as well, but less" | `"emphasis": "highlight"` on Y |
| "Y is just context", "grey out the old one" | `"emphasis": "muted"` |
| "X is new", "Y is being retired" | `"status"` on that node, only because the user said so |
| "Add the so-what" | `callout.text`; without an `anchor` it is a bar under the diagram |
| "The title is weak", "punchier" | Rewrite `title` as a finding in under 90 characters, using only the user's facts |

## Icons and names

| The user says | Edit |
| --- | --- |
| "Use our names", "call it the Orders pipeline" | `label` on the node, keeping the product recognisable; the product name can go in `description` |
| "Wrong icon", "that's DLT" | `diagram-studio databricks icons <words>` (former names work) and change `service` |
| "Add Azure Data Lake", "Event Hubs" | Azure services by their Azure id (`storage-accounts`, `event-hubs`). For a name both catalogs know, `"azure:ai-search"` is the Azure product |
| "We're on AWS" | Cloud services as plain boxes (no `service`) or generic participants (`database`, `client`); the `cloud-account` boundary named "Your AWS account" |
| "Add the Databricks logo" | It is already on the `platform` and `databricks-account` boundaries; never as a node |

## Look and feel

| The user says | Edit |
| --- | --- |
| "Make it look like the Azure diagrams" | `"theme": "azure"` (or hand an Azure-centred picture to `/diagram-studio:azure`) |
| "For the leadership deck" | `"theme": "boardroom"` |
| "Black and white", "for printing" | `"theme": "print"` |
| "Put it in our brand" | `diagram-studio theme create --from-brand --id <id> --colors "#accent,#second" [--font "Name"]`, then `"theme": "<id>"`. Pass on the notes it prints |
| "For the wiki", "no title on the picture" | `"frame": "figure"` |
| "Make that box blue", "recolour the icon" | Icons are never recoloured, and boxes have no colour field. Colour carries meaning: offer `accent`, `highlight`, `muted`, or a flow type |

A theme switch keeps the structure, but product cells are sized from labels in the theme's font, so the diagram may grow a little. Re-check the preview after switching.
