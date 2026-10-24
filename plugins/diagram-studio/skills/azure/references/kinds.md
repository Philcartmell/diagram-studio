# Kinds of Azure diagram

How to match the content to a kind of diagram, how to sketch each kind for an `AskUserQuestion` preview, and how to make concepts that differ. The engine's `diagram-studio docs azure-style` defines the kinds; this page is about choosing between them in a session.

## Which kind fits the content

Start from the question the reader brings, not from the services the user listed. The same ten services make a five-step workflow for the steering committee and a subnet-by-subnet topology for the network team.

| The reader asks… | Kind | Also worth a concept when… |
| --- | --- | --- |
| "How does it work?": a request, document or event moving through services | solution workflow | the reviewers care where it runs (network topology) |
| "Where does it run, and how is traffic contained?": regions, virtual networks, subnets, private endpoints | network topology | one request path is the point (hybrid) |
| "Which controls does this request cross?": inbound and egress, reads and writes | hybrid: the topology with two or three numbered flows and a legend | the audience is not technical enough for the network (solution workflow) |
| "What happens when a region fails?" | network topology across two regions, the failed region muted and the failover path numbered | the steady state matters as much (the same topology, no failure) |
| "What did we actually deploy?" (an ARM template or resource list) | the imported draft, then a curated workflow or topology | always: the draft has no story until it is curated |

The audience narrows it further. Executives get a solution workflow (`executive`, at most nine services, 4–7 steps). An architecture review gets a workflow with its key network controls, or a baseline topology without every subnet (`management`, up to 20). Engineers get the full topology with subnets, NSGs, private endpoints and zones (`detailed`, up to 60).

## What each kind needs from the user

Ask for exactly what is missing, in plain words. Never fill a gap yourself.

| Kind | Needs | Nice to have |
| --- | --- | --- |
| Solution workflow | the services, and the steps in order: what happens at each | stage names ("Ingest", "Process", "Serve"), parallel branches, where users and outside systems come in |
| Network topology | the services, and where each runs: region, virtual network, subnet; which PaaS services are reached privately | address spaces, NSGs, zones, hub and spoke, the firewall, monitoring, an ARM template to draft from |
| Hybrid | the topology, plus the two or three flows to trace | the controls each flow crosses, a name for each flow type |
| Failover | the regions, what runs in each, the global entry point | what is shared across regions, the failover steps in order |

## Sketches for option previews

An `AskUserQuestion` option can carry a `preview`, shown in a monospace box beside the options. Draw the user's **own** services into the sketch, shortened if needed, so they see their architecture in each kind. Keep it to about 8 lines and 65 columns. These are the patterns, shown with placeholder services.

Solution workflow (stage groups, green numbered steps, a workflow panel):

```
 ┌ Ingest ──────┐   ┌ Process ───────────────┐   ┌ Serve ───────┐
 │ [Web app]─①──┼──▶│ [Bus]─②─▶[Functions]─③─┼──▶│ [AI Search]  │
 │ [Blob]       │   │          [Doc Intel]   │   │ [Agent] ④    │
 └──────────────┘   └────────────────────────┘   └──────────────┘
```

Network topology (region, virtual network, subnets, private endpoints lined up with their services):

```
         ┌ East US 2 ───────────────────────────────────────────┐
         │ ┌ Spoke VNet ───────────────────────────┐            │
 [Users]─┼▶│ [AppGW snet]▶[App snet]▶[PE snet: PE]─┼▶[Key Vault]│
         │ └───────────────────────────────────────┘ [SQL DB]   │
         └──────────────────────────────────────────────────────┘
```

Hybrid (the topology with one badge shape per flow, and a legend):

```
          ┌ East US 2 ──────────────────────────────────┐
          │ ┌ Hub VNet ──────┐   ┌ Spoke VNet ────────┐ │
 [Users]─①┼▶│ [AppGW]────────┼②─▶│ [App]─③─▶[PE: SQL] │ │
          │ │ [Firewall]◀────┼◆1─┼─┘                  │ │
          │ └──┬─────────────┘   └────────────────────┘ │
          └────┼────────────────────────────────────────┘
               └◆2─▶[Internet]         ① Inbound   ◆ Egress
```

Failover (two regions with the same structure, the failed one muted, the failover path numbered):

```
              ┌ Region A ░ muted ░──────────────┐  ┌ Shared ────┐
 [Front Door]─┤ [AppGW]──▶[AKS]──▶[Cosmos DB]   │  │ [Registry] │
      │       └─────────────────────────────────┘  │ [Key Vault]│
      └──①───▶┌ Region B ───────────────────────┐  │ [Monitor]  │
              │ [AppGW]─②▶[AKS]─③▶[Cosmos DB]   │  └────────────┘
              └─────────────────────────────────┘
```

## Making concepts diverge

Each concept should make a different thing obvious. In order of preference:

1. **A different kind.** A solution workflow (how it works) against a network topology (where it runs) against a hybrid (which controls a request crosses). This is the usual set of three when the user has not said which they need.
2. **The same kind, a different story.**
   - *The traced flow:* the inbound user request in one concept, the egress path or the data write in another.
   - *The failure case:* the steady-state topology beside the same topology with one region muted (`"emphasis": "muted"` on its boundary) and the failover path numbered.
   - *The accent:* the new service, the private endpoint path or the at-risk dependency. Each one implies a different title.
   - *Altitude:* an executive workflow next to a management view, when the user is unsure how much detail the room wants.
3. **The deployment against the story.** From an ARM import, concept A is the draft as deployed; concept B is the same estate curated into a workflow or a clean topology.
4. **Never** a theme change alone. The `azure` theme is the house style. Another theme (`boardroom` for a leadership deck, `print`) is a styling choice, offered after a direction is picked.

Give each concept its own action title that matches what it makes obvious. When presenting, give one line per concept: the letter, the kind, what it makes obvious, and what it gives up ("B: network topology. Shows every data path staying on private endpoints. Loses the order of the steps.").
