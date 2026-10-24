# Refining: from request to spec edit

People ask for changes in visual words. The spec only carries meaning, so translate each request into the field that produces it. Edit only those fields, render, and say what you changed. Field details are in `diagram-studio docs spec-format` and `diagram-studio docs <type>`.

## Emphasis and focus

| The user says | Edit |
| --- | --- |
| "Make X stand out", "highlight X", "the focus is X" | `"emphasis": "accent"` on X. At `executive` there are at most two accents, counting accented layers, lanes and quadrants, so take the accent off whatever had it. Check the title still matches the new focus |
| "And Y as well, but less" | `"emphasis": "highlight"` on Y (the theme's second colour) |
| "Y is just context", "fade Y out", "grey out the old one" | `"emphasis": "muted"` |
| "X is new", "Y is being retired", "Z is at risk" | `"status"` on that element, only because the user said so |
| "Add the so-what", "what's the point?" | `callout.text`. Add `anchor` to place it beside one element (good for swimlanes and 2x2s); leave the anchor out for a bar under the diagram (good for layers and roadmaps) |
| "The title is weak", "punchier" | Rewrite `title` as a finding in under 90 characters, using only the user's facts. Offer two options if it changes the claim |

## Amount of detail

| The user says | Edit |
| --- | --- |
| "Too busy", "too much text", "simplify" | Group siblings into one node, drop `description`s, shorten labels, remove the subtitle or `"legend": "none"`. Keep `executive` |
| "Needs more detail", "the team will use this" | `"altitude": "management"`, then add descriptions, owners and metrics the user gives you. Ask for them; do not invent |
| "Text is too small" | There is no font-size field. Reduce content, or raise legibility by grouping. The theme sets the sizes |

## Structure and layout

| The user says | Edit |
| --- | --- |
| "Add a step / lane / layer / workstream" | Add it to the right array with a new kebab-case `id`. For swimlanes also add the `edges` in and out |
| "Rename X" | Change `label`; keep the `id`, since edges and the callout anchor point at it |
| "Swap the order", "put finance first" | Reorder the array (lanes, layers, workstreams, nodes in a layer). Swimlane step order comes from the edges, not the array |
| "Move this item" (2x2) | Change its `x` / `y` (0 to 1), or its `quadrant`. Never exactly 0.5 |
| "Move this box over there" (any other type) | Positions are not free: the engine lays out from structure. Offer the structural change that gets close (reorder, regroup, change lane or layer) |
| "Make it vertical", "too many lanes" | Swimlane `"orientation": "vertical"` |
| "For a document", "portrait" | `"canvas": { "aspect": "A4-portrait" }` (or `A4-landscape`) |
| "It doesn't fit", "let it grow" | `"canvas": { "aspect": "auto" }`, for working-team diagrams only; slides stay 16:9 |
| "Show real dates", "the phases aren't equal" | Roadmap `"scale": "time"` with `start` and `end` on every horizon |
| "Show it as a … instead" | A new form is a new concept, not an edit: write `concepts/<next letter>-<form>/spec.json` from the brief, render it beside the current one, and let the user choose |

## Look and feel

| The user says | Edit |
| --- | --- |
| "Hand-drawn", "for the workshop" | `"theme": "sketch"` |
| "Darker", "for the keynote" | `"theme": "bold"` |
| "Black and white", "for printing" | `"theme": "print"` |
| "Cleaner", "for a document" | `"theme": "minimal"` |
| "Blueprint style" | `"theme": "blueprint"` |
| "Use red for the accent" | `"themeOverrides": { "color": { "accent": "#hex" } }` (checked for contrast) |
| "Put it in our brand" | `diagram-studio theme create --from-brand --id <id> --colors "#accent,#second" [--font "Name"]`, then `"theme": "<id>"`. Pass on the notes it prints |
| "Make that box blue" | There are no per-box colours. Colour carries meaning: offer `accent`, `highlight` or `muted`, or a `tags` marker for a category |

Geometry stays put when only the theme changes, so a theme switch is a safe last step.
