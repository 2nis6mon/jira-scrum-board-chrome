<#
.SYNOPSIS
  Lit, en lecture seule, les propriétés de sprint et de board de l'extension Sprint Goals Board.

.DESCRIPTION
  Appelle uniquement trois adresses GET de l'API Agile de Jira :
    - /rest/agile/1.0/sprint/{id}                                                    (nom, goal, dates, état)
    - /rest/agile/1.0/sprint/{id}/properties/com.scrumboardmac.sprintgoals.v1        (objectifs et liens)
    - /rest/agile/1.0/board/{id}/properties/com.scrumboardmac.boardsettings.v1       (objectifs masqués)
  Le jeton vient du coffre SecretManagement (secret JiraReadToken). Il n'est jamais affiché ni écrit.
  Le résultat est écrit dans un fichier JSON (par défaut dans le dossier temporaire) sans aucun secret.

.EXAMPLE
  .\lire-proprietes-jira.ps1 -Email prenom.nom@exemple.com -SprintId 22439,22440 -BoardId 3018

.EXAMPLE
  # Jeton à scopes : passer par la passerelle api.atlassian.com
  .\lire-proprietes-jira.ps1 -Email prenom.nom@exemple.com -SprintId 22439 -Passerelle
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $Email,
  [Parameter(Mandatory)] [int[]] $SprintId,
  [int] $BoardId = 0,
  [string] $Coffre = "JiraVault",
  [string] $Secret = "JiraReadToken",
  [string] $Site = "https://mousquetaires.atlassian.net",
  [string] $CloudId = "758e87d6-b9f0-4627-b459-ec1a3b03babf",
  [switch] $Passerelle,
  [string] $Sortie = (Join-Path $env:TEMP "proprietes-jira.json")
)

$ErrorActionPreference = "Stop"

$base = if ($Passerelle) { "https://api.atlassian.com/ex/jira/$CloudId" } else { $Site.TrimEnd("/") }

# Le jeton reste dans un SecureString jusqu'à l'appel, puis dans l'en-tête, jamais dans une sortie.
$jeton = Get-Secret -Name $Secret -Vault $Coffre
$mot = [System.Net.NetworkCredential]::new("", $jeton).Password
$entetes = @{
  Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${Email}:$mot"))
  Accept        = "application/json"
}
Remove-Variable mot, jeton

function Get-Jira {
  param([string] $Chemin)
  try {
    return @{ ok = $true; found = $true; data = (Invoke-RestMethod -Method Get -Uri "$base$Chemin" -Headers $entetes) }
  } catch {
    $code = [int]$_.Exception.Response.StatusCode
    if ($code -eq 404) { return @{ ok = $true; found = $false } }
    return @{ ok = $false; status = $code }
  }
}

$resultat = [ordered]@{ lu = (Get-Date).ToString("o"); source = $base; sprints = @(); board = $null }

foreach ($id in $SprintId) {
  $sprint = Get-Jira "/rest/agile/1.0/sprint/$id"
  $prop = Get-Jira "/rest/agile/1.0/sprint/$id/properties/com.scrumboardmac.sprintgoals.v1"
  $resultat.sprints += [ordered]@{
    id       = $id
    sprint   = if ($sprint.ok -and $sprint.found) { $sprint.data | Select-Object id, name, state, goal, startDate, endDate, completeDate, originBoardId } else { $sprint }
    property = if ($prop.ok -and $prop.found) { $prop.data.value } else { $prop }
  }
  Write-Host ("Sprint {0} : propriété {1}" -f $id, $(if ($prop.ok -and $prop.found) { "lue" } elseif ($prop.ok) { "absente" } else { "erreur HTTP " + $prop.status }))
}

if ($BoardId -gt 0) {
  $b = Get-Jira "/rest/agile/1.0/board/$BoardId/properties/com.scrumboardmac.boardsettings.v1"
  $resultat.board = [ordered]@{
    id            = $BoardId
    hiddenGoalIds = if ($b.ok -and $b.found) { @($b.data.value.settings.hiddenGoalIds) } else { $b }
  }
  Write-Host ("Board {0} : réglages {1}" -f $BoardId, $(if ($b.ok -and $b.found) { "lus" } elseif ($b.ok) { "absents" } else { "erreur HTTP " + $b.status }))
}

$resultat | ConvertTo-Json -Depth 10 | Set-Content -Path $Sortie -Encoding utf8
Write-Host "Résultat écrit dans : $Sortie"
