$ErrorActionPreference = "Stop"

# Repositorio del que se actualiza ESTA copia. El repo de desarrollo es
# PokeIdleLab; la copia estable (Poke-Idle-Lab-Estable) usa su propio repo.
$repoName = "PokeIdleLab"
$repoZip = "https://github.com/GigaBuda/$repoName/archive/refs/heads/main.zip"
$repo = $PSScriptRoot

# Lista de archivos que trajo la sincronizacion anterior. Sirve para borrar
# los que desaparecieron del repo sin tocar nunca archivos propios del usuario.
$manifestFile = Join-Path $repo ".sync-manifest.txt"
$keep = @("node_modules", ".env", ".env.local", ".sync-manifest.txt")

$tempRoot = Join-Path $env:TEMP ("PokeIdleSync_" + [guid]::NewGuid().ToString("N"))
$zipFile = Join-Path $tempRoot "repo.zip"
$extractDir = Join-Path $tempRoot "extract"

try {
    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

    Write-Host "Descargando la version actual de $repoName desde GitHub..."
    Invoke-WebRequest -Uri $repoZip -OutFile $zipFile -UseBasicParsing

    Expand-Archive -Path $zipFile -DestinationPath $extractDir -Force

    $downloadedRoot = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1

    if (-not $downloadedRoot) {
        throw "No se encontro la carpeta del proyecto descargado."
    }

    $rootPath = $downloadedRoot.FullName.TrimEnd('\') + '\'
    $newFiles = Get-ChildItem -Path $downloadedRoot.FullName -Recurse -File -Force |
        ForEach-Object { $_.FullName.Substring($rootPath.Length) } |
        Where-Object { $keep -notcontains ($_ -split '\\')[0] }

    # Conservamos la instalacion local y reemplazamos los archivos del proyecto
    # por los de GitHub. No tocamos node_modules ni .env local.
    Get-ChildItem -Path $downloadedRoot.FullName -Force | ForEach-Object {
        if ($keep -notcontains $_.Name) {
            Copy-Item -Path $_.FullName -Destination $repo -Recurse -Force
        }
    }

    if (Test-Path $manifestFile) {
        $oldFiles = Get-Content -Path $manifestFile
        foreach ($old in $oldFiles) {
            if ($old -and ($newFiles -notcontains $old)) {
                $target = Join-Path $repo $old
                if (Test-Path -LiteralPath $target -PathType Leaf) {
                    Remove-Item -LiteralPath $target -Force
                    Write-Host "       Eliminado (ya no esta en GitHub): $old"
                }
            }
        }
    }
    Set-Content -Path $manifestFile -Value $newFiles -Encoding UTF8

    Write-Host "[OK] $repoName esta actualizado."
}
catch {
    Write-Host "[AVISO] No se pudo actualizar desde GitHub. Continuando con la version local."
    Write-Host ("       " + $_.Exception.Message)
}
finally {
    if (Test-Path $tempRoot) {
        Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
