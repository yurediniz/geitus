<#
.SYNOPSIS
    Carrega o .env da raiz do repositorio e sobe o backend do Geitus (spring-boot:run).

.DESCRIPTION
    - Le o arquivo .env (KEY=VALUE; linhas em branco e comentarios "#" sao ignorados).
    - As variaveis valem apenas para o processo do backend: ao terminar, o ambiente
      da sessao do PowerShell e restaurado (nada "vaza" para o terminal).
    - Valores do .env prevalecem sobre variaveis ja definidas na sessao.
    - Nenhum valor e exibido na tela (apenas os nomes das variaveis carregadas).
    - Verifica se o Java ativo e o 21 (exigido pelo maven-enforcer). Se a maquina
      tiver outro JDK como padrao, defina JAVA_HOME no proprio .env.

.PARAMETER EnvFile
    Caminho do arquivo .env. Padrao: <raiz do repositorio>\.env

.PARAMETER MavenArgs
    Argumentos extras repassados ao Maven Wrapper. Use aspas em argumentos com
    ponto, senao o PowerShell os divide (ex.: '-Dspring-boot.run.profiles=dev').

.EXAMPLE
    .\scripts\dev-backend.ps1

.EXAMPLE
    .\scripts\dev-backend.ps1 '-Dspring-boot.run.profiles=dev'

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\dev-backend.ps1
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    [string]$EnvFile,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$MavenArgs = @()
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot 'backend'
if (-not $EnvFile) { $EnvFile = Join-Path $repoRoot '.env' }

if (-not (Test-Path -LiteralPath $EnvFile)) {
    Write-Host ("Arquivo .env nao encontrado em '{0}'. Copie o modelo: Copy-Item .env.example .env" -f $EnvFile) -ForegroundColor Red
    exit 1
}

# ----- Leitura do .env -----
$variaveis = [ordered]@{}
$numeroLinha = 0
foreach ($linha in Get-Content -LiteralPath $EnvFile -Encoding UTF8) {
    $numeroLinha++
    $texto = $linha.TrimStart([char]0xFEFF).Trim()
    if ($texto -eq '' -or $texto.StartsWith('#')) { continue }
    if ($texto.StartsWith('export ')) { $texto = $texto.Substring(7).TrimStart() }

    $separador = $texto.IndexOf('=')
    if ($separador -lt 1) {
        Write-Warning ("Linha {0} do .env ignorada (formato esperado: CHAVE=valor)." -f $numeroLinha)
        continue
    }

    $chave = $texto.Substring(0, $separador).Trim()
    $valor = $texto.Substring($separador + 1).Trim()
    if ($valor.Length -ge 2 -and (($valor.StartsWith('"') -and $valor.EndsWith('"')) -or ($valor.StartsWith("'") -and $valor.EndsWith("'")))) {
        $valor = $valor.Substring(1, $valor.Length - 2)
    }
    $variaveis[$chave] = $valor
}

# ----- Aplica no processo, guardando o estado anterior para restaurar -----
$anteriores = @{}
foreach ($chave in $variaveis.Keys) {
    $anteriores[$chave] = [Environment]::GetEnvironmentVariable($chave, 'Process')
    [Environment]::SetEnvironmentVariable($chave, $variaveis[$chave], 'Process')
}

$codigoSaida = 0
try {
    Write-Host ("Variaveis carregadas de {0}: {1}" -f $EnvFile, ($variaveis.Keys -join ', '))

    # ----- Verifica o Java 21 -----
    $java = 'java'
    if ($env:JAVA_HOME) { $java = Join-Path $env:JAVA_HOME 'bin\java.exe' }
    $versaoJava = $null
    # "java -version" escreve no stderr: no Windows PowerShell 5.1 isso viraria erro com 'Stop'.
    $ErrorActionPreference = 'Continue'
    try {
        $saidaJava = (& $java -version 2>&1 | Out-String)
        if ($saidaJava -match 'version "(\d+)') { $versaoJava = [int]$Matches[1] }
    } catch {
        $versaoJava = $null
    } finally {
        $ErrorActionPreference = 'Stop'
    }
    if ($versaoJava -ne 21) {
        $encontrada = if ($versaoJava) { $versaoJava } else { 'nao encontrada' }
        throw ("O backend exige Java 21 (versao ativa: {0}). Defina JAVA_HOME apontando para um JDK 21 no .env ou na sessao." -f $encontrada)
    }

    if (-not $env:POSTGRES_PASSWORD) {
        Write-Warning 'POSTGRES_PASSWORD nao definido: a aplicacao nao sobe sem a senha do banco (nao ha valor padrao).'
    } elseif ($env:POSTGRES_PASSWORD -ceq 'troque-esta-senha' -or $env:POSTGRES_PASSWORD -ceq 'geitus') {
        # Compara sem mostrar o valor: so diz que e um valor publico.
        Write-Warning 'POSTGRES_PASSWORD com o marcador do .env.example ou o antigo padrao: defina uma senha propria no .env (e no conteiner do banco).'
    }
    if (-not $env:JWT_SECRET) {
        Write-Warning 'JWT_SECRET nao definido: a aplicacao nao sobe sem um segredo de no minimo 32 bytes.'
    }
    if (-not $env:GEITUS_IMAGEM_SEGREDO) {
        Write-Warning 'GEITUS_IMAGEM_SEGREDO nao definido: a aplicacao nao sobe sem um segredo de no minimo 32 bytes, diferente do JWT_SECRET.'
    }

    Write-Host ("Subindo o backend (Java {0}, porta {1})..." -f $versaoJava, $(if ($env:SERVER_PORT) { $env:SERVER_PORT } else { '8080' }))
    Push-Location $backendDir
    try {
        & .\mvnw.cmd spring-boot:run @MavenArgs
        $codigoSaida = $LASTEXITCODE
    } finally {
        Pop-Location
    }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    $codigoSaida = 1
} finally {
    foreach ($chave in $anteriores.Keys) {
        [Environment]::SetEnvironmentVariable($chave, $anteriores[$chave], 'Process')
    }
}

exit $codigoSaida
