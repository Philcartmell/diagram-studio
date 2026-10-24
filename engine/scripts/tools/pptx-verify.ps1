# Opens a PPTX in PowerPoint (read-only, hidden), exports slide 1 to PNG and
# lists shapes: groups, connectors and editable text. Quits PowerPoint only if
# it was not already running with open presentations.
param([Parameter(Mandatory = $true)][string]$Pptx, [string]$Png)
$ErrorActionPreference = 'Stop'
$full = (Resolve-Path $Pptx).Path
if (-not $Png) { $Png = [System.IO.Path]::ChangeExtension($full, '.ppt.png') }
$ppt = New-Object -ComObject PowerPoint.Application
$had = $ppt.Presentations.Count
$pres = $ppt.Presentations.Open($full, $true, $false, $false)
try {
  $slide = $pres.Slides.Item(1)
  $slide.Export($Png, 'PNG', 2560, 1440)
  $groups = 0; $connectors = 0; $glued = 0; $texts = 0; $shapes = 0
  $editable = @()
  foreach ($s in $slide.Shapes) {
    $shapes++
    if ($s.Type -eq 6) {
      $groups++
      foreach ($g in $s.GroupItems) { if ($g.HasTextFrame -and $g.TextFrame.HasText) { $texts++; $editable += "$($s.Name): $($g.TextFrame.TextRange.Text)" } }
    } elseif ($s.Connector) {
      $connectors++
      if ($s.ConnectorFormat.BeginConnected -and $s.ConnectorFormat.EndConnected) { $glued++ }
    } elseif ($s.HasTextFrame -and $s.TextFrame.HasText) { $texts++ }
  }
  $title = ''
  try { $title = $slide.Shapes.Title.TextFrame.TextRange.Text } catch {}
  $notes = ''
  try { $notes = $slide.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text } catch {}
  [pscustomobject]@{ shapes = $shapes; groups = $groups; connectors = $connectors; glued = $glued; textBoxes = $texts; titlePlaceholder = $title; notes = $notes; png = $Png } | ConvertTo-Json
  $editable | Select-Object -First 6
} finally {
  $pres.Close()
  if ($had -eq 0) { $ppt.Quit() }
}
