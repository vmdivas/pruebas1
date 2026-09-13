#Requires -Version 5.0
<#
.SYNOPSIS
    Agente de Inventario de Equipos TI
    Recolecta información de hardware y software, la envía a Firebase/Servidor Virtual

.DESCRIPTION
    - Recolecta: CPU, RAM, Disco, SO, IP, MAC, Usuario, Nombre Equipo, Serial
    - Envía a Firebase REST API (Firestore) o Servidor Virtual
    - Guarda localmente si hay error de conexión y reintenta
    - Logs en C:\ProgramData\AgentInventario\logs
    - Distribuible via GPO / Group Policy Objects

.NOTES
    Autor: Sistema de Inventario TI
    Requiere: PowerShell 5.0+, acceso a red
    Ejecutar como: SYSTEM (via GPO) o administrador (manual)
#>

param(
    [string]$ConfigPath = "C:\ProgramData\AgentInventario\config.json"
)

# ============================================================================
# CONFIGURACIÓN INICIAL
# ============================================================================

$ErrorActionPreference = "Stop"
$WarningPreference = "SilentlyContinue"

# Crear directorios si no existen
$BaseDir = "C:\ProgramData\AgentInventario"
$LogDir = "$BaseDir\logs"
$DataDir = "$BaseDir\data"
$ConfigDir = "$BaseDir"

@($BaseDir, $LogDir, $DataDir, $ConfigDir) | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
    }
}

# ============================================================================
# FUNCIONES DE LOGGING
# ============================================================================

function Log {
    param([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogFile = "$LogDir\agent-$(Get-Date -Format 'yyyyMMdd').log"
    $LogMessage = "[$Timestamp] [$Level] $Message"

    Add-Content -Path $LogFile -Value $LogMessage -Force
    Write-Host $LogMessage
}

function LogError {
    param([string]$Message)
    Log $Message "ERROR"
}

function LogWarning {
    param([string]$Message)
    Log $Message "WARNING"
}

function LogSuccess {
    param([string]$Message)
    Log $Message "SUCCESS"
}

# ============================================================================
# FUNCIONES DE CONFIGURACIÓN
# ============================================================================

function Load-Configuration {
    if (-not (Test-Path $ConfigPath)) {
        LogError "Archivo de configuración no encontrado: $ConfigPath"
        Create-DefaultConfig
        exit 1
    }

    try {
        $config = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json
        Log "Configuración cargada desde: $ConfigPath"
        return $config
    }
    catch {
        LogError "Error al leer configuración: $_"
        exit 1
    }
}

function Create-DefaultConfig {
    Log "Creando archivo de configuración por defecto..."

    $defaultConfig = @{
        endpoint = @{
            type = "firebase"  # "firebase" o "custom"
            firebase = @{
                projectId = "tu-proyecto-firebase"
                database = "equiposTI_v2"
                apiKey = "tu-api-key-firebase"
            }
            custom = @{
                url = "https://ti.empresa.com/api/inventario/"
                authType = "bearer"  # "bearer", "basic", "none"
                token = "tu-token-aqui"
            }
        }
        schedule = @{
            frequency = "hourly"  # "manual", "hourly", "daily", "weekly"
            hour = 22  # Hora de ejecución si es daily
        }
        retry = @{
            maxAttempts = 5
            delaySeconds = 60
            exponentialBackoff = $true
        }
        data = @{
            includeHardware = $true
            includeSoftware = $true
            includNetwork = $true
            sendFullInventory = $false  # true = completo, false = solo cambios
        }
        security = @{
            validateSSL = $true
            useProxy = $false
            proxyServer = ""
        }
        logging = @{
            level = "INFO"  # "DEBUG", "INFO", "WARNING", "ERROR"
            maxLogSizeMB = 100
            retentionDays = 30
        }
    }

    $defaultConfig | ConvertTo-Json -Depth 4 | Set-Content -Path $ConfigPath -Force
    Log "Configuración por defecto creada en: $ConfigPath"
}

# ============================================================================
# RECOLECCIÓN DE INFORMACIÓN DE HARDWARE
# ============================================================================

function Get-ComputerHardware {
    $hardware = @{}

    try {
        Log "Recolectando información de hardware..."

        # Información básica del equipo
        $computerInfo = Get-CimInstance Win32_ComputerSystem
        $hardware.nombreEquipo = $computerInfo.Name
        $hardware.fabricante = $computerInfo.Manufacturer
        $hardware.modelo = $computerInfo.Model
        $hardware.tipoEquipo = $computerInfo.SystemType
        $hardware.usuarioDominio = $computerInfo.UserName

        # Serial/Service Tag
        try {
            $bios = Get-CimInstance Win32_BIOS
            $hardware.serialNumber = $bios.SerialNumber
            $hardware.biosVersion = $bios.Version
            $hardware.biosFecha = if ($bios.ReleaseDate) { $bios.ReleaseDate.ToString("yyyy-MM-dd") } else { "N/A" }
        }
        catch {
            LogWarning "No se pudo obtener número serial: $_"
            $hardware.serialNumber = "N/A"
        }

        # Procesador
        try {
            $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
            $hardware.procesador = @{
                nombre = $cpu.Name
                nucleos = $cpu.NumberOfCores
                hilos = $cpu.NumberOfLogicalProcessors
                velocidad = "$($cpu.MaxClockSpeed) MHz"
            }
        }
        catch {
            LogWarning "No se pudo obtener info de CPU: $_"
            $hardware.procesador = @{ nombre = "N/A" }
        }

        # Memoria RAM (total + desglose por modulo/ranura, igual que GLPI)
        try {
            $ram = Get-CimInstance Win32_ComputerSystem
            $modulos = @()
            Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
                $modulos += @{
                    ranura = $_.DeviceLocator
                    capacidad = "$([math]::Round($_.Capacity / 1GB, 2)) GB"
                    fabricante = $_.Manufacturer
                    velocidad = "$($_.Speed) MHz"
                    numeroParte = $(if ($_.PartNumber) { $_.PartNumber.Trim() } else { "N/A" })
                }
            }
            $hardware.memoria = @{
                total = "$([math]::Round($ram.TotalPhysicalMemory / 1GB, 2)) GB"
                totalBytes = $ram.TotalPhysicalMemory
                modulos = $modulos
                ranurasUsadas = $modulos.Count
            }
        }
        catch {
            LogWarning "No se pudo obtener info de RAM: $_"
            $hardware.memoria = @{ total = "N/A" }
        }

        # Discos duros
        try {
            $discos = @()
            Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 } | ForEach-Object {
                $discos += @{
                    unidad = $_.Name
                    tamanio = "$([math]::Round($_.Size / 1GB, 2)) GB"
                    espacioLibre = "$([math]::Round($_.FreeSpace / 1GB, 2)) GB"
                    porcentajeUso = [math]::Round(($_.Size - $_.FreeSpace) / $_.Size * 100, 2)
                }
            }
            $hardware.discos = $discos
        }
        catch {
            LogWarning "No se pudo obtener info de discos: $_"
            $hardware.discos = @()
        }

        # Sistema Operativo
        try {
            $os = Get-CimInstance Win32_OperatingSystem
            # "DisplayVersion" (ej. "25H2") no viene en Win32_OperatingSystem, solo en el
            # registro. Si falla (versiones viejas de Windows sin esa clave), se deja "N/A".
            $versionDisplay = "N/A"
            try {
                $versionDisplay = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion" -ErrorAction Stop).DisplayVersion
            }
            catch {
                LogWarning "No se pudo obtener DisplayVersion del SO: $_"
            }
            $hardware.sistemaOperativo = @{
                nombre = $os.Caption
                version = $os.Version
                versionDisplay = $versionDisplay
                build = $os.BuildNumber
                arquitectura = $os.OSArchitecture
                serial = $os.SerialNumber
                tiempoEncendido = [math]::Round((New-TimeSpan -Start $os.LastBootUpTime).TotalHours, 2)
                fechaArranque = $os.LastBootUpTime.ToString("yyyy-MM-dd HH:mm:ss")
            }
        }
        catch {
            LogWarning "No se pudo obtener info del SO: $_"
            $hardware.sistemaOperativo = @{ nombre = "N/A" }
        }

        # Información de Red
        try {
            $nics = @()
            Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
                $nic = $_
                $ip = Get-NetIPAddress -InterfaceIndex $nic.ifIndex -ErrorAction SilentlyContinue | Select-Object -First 1
                $nics += @{
                    nombre = $nic.Name
                    descripcion = $nic.InterfaceDescription
                    mac = $nic.MacAddress
                    ip = $ip.IPAddress
                    estado = $nic.Status
                    velocidad = "$($nic.LinkSpeed)"
                }
            }
            $hardware.redAdaptadores = $nics
        }
        catch {
            LogWarning "No se pudo obtener info de red: $_"
            $hardware.redAdaptadores = @()
        }

        # IP principal (primera interfaz activa)
        try {
            $ipPrincipal = Get-NetIPAddress -AddressFamily IPv4 -PrefixLength 24 -ErrorAction SilentlyContinue |
                            Where-Object { $_.IPAddress -ne "127.0.0.1" } |
                            Select-Object -First 1
            $hardware.ipPrincipal = $ipPrincipal.IPAddress
            $hardware.macPrincipal = (Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1).MacAddress
        }
        catch {
            LogWarning "No se pudo obtener IP/MAC principal: $_"
            $hardware.ipPrincipal = "N/A"
            $hardware.macPrincipal = "N/A"
        }

        # Monitor(es) conectado(s) actualmente
        # Se lee via WMI (root\wmi, WmiMonitorID) que expone el EDID reportado por el
        # propio monitor (fabricante/modelo/serial) - funciona con cualquier marca de
        # monitor, sin importar la marca de la PC (Lenovo, Dell, etc).
        try {
            $hardware.monitores = Get-ConnectedMonitors
        }
        catch {
            LogWarning "No se pudo obtener info de monitores: $_"
            $hardware.monitores = @()
        }

        # Antivirus instalado (Windows Defender u otro), via WMI SecurityCenter2
        try {
            $hardware.antivirus = Get-Antivirus
        }
        catch {
            LogWarning "No se pudo obtener info de antivirus: $_"
            $hardware.antivirus = @()
        }

        # Firewall de Windows (perfiles Dominio/Publico/Privado)
        try {
            $hardware.firewall = Get-FirewallStatus
        }
        catch {
            LogWarning "No se pudo obtener estado de firewall: $_"
            $hardware.firewall = @()
        }

        # Controladores PCI, dispositivos USB, tarjetas de sonido, puertos fisicos y
        # ranuras de expansion - mismo nivel de detalle que el agente oficial de GLPI,
        # para tener un inventario equivalente mientras se aprueba/despliega GLPI.
        try {
            $hardware.controladores = Get-PciControllers
        }
        catch {
            LogWarning "No se pudo obtener controladores PCI: $_"
            $hardware.controladores = @()
        }

        try {
            $hardware.usbDispositivos = Get-UsbDevices
        }
        catch {
            LogWarning "No se pudo obtener dispositivos USB: $_"
            $hardware.usbDispositivos = @()
        }

        try {
            $hardware.tarjetasSonido = Get-SoundDevices
        }
        catch {
            LogWarning "No se pudo obtener tarjetas de sonido: $_"
            $hardware.tarjetasSonido = @()
        }

        try {
            $hardware.puertos = Get-PhysicalPorts
        }
        catch {
            LogWarning "No se pudo obtener puertos físicos: $_"
            $hardware.puertos = @()
        }

        try {
            $hardware.slots = Get-ExpansionSlots
        }
        catch {
            LogWarning "No se pudo obtener ranuras de expansión: $_"
            $hardware.slots = @()
        }

        LogSuccess "Información de hardware recolectada correctamente"
        return $hardware
    }
    catch {
        LogError "Error recolectando hardware: $_"
        return $null
    }
}

function ConvertFrom-WmiMonitorBytes {
    # Las propiedades de WmiMonitorID (ManufacturerName, UserFriendlyName,
    # SerialNumberID) vienen como arreglos de UInt16 (codigos de caracter),
    # rellenados con ceros al final.
    param([uint16[]]$Bytes)
    if (-not $Bytes -or $Bytes.Count -eq 0) { return "" }
    -join ($Bytes | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ })
}

function Get-ConnectedMonitors {
    $monitores = @()
    try {
        Get-CimInstance -Namespace "root\wmi" -ClassName WmiMonitorID -ErrorAction Stop | ForEach-Object {
            $fabricanteCodigo = ConvertFrom-WmiMonitorBytes -Bytes $_.ManufacturerName
            $monitores += @{
                fabricante = if ($fabricanteCodigo) { $fabricanteCodigo } else { "N/A" }
                modelo = $(if ($nombre = ConvertFrom-WmiMonitorBytes -Bytes $_.UserFriendlyName) { $nombre } else { "N/A" })
                serial = $(if ($serie = ConvertFrom-WmiMonitorBytes -Bytes $_.SerialNumberID) { $serie } else { "N/A" })
                activo = [bool]$_.Active
            }
        }
    }
    catch {
        LogWarning "No se pudo consultar WmiMonitorID (puede requerir permisos de administrador): $_"
    }
    return $monitores
}

function Get-Antivirus {
    $productos = @()
    try {
        Get-CimInstance -Namespace "root/SecurityCenter2" -ClassName AntivirusProduct -ErrorAction Stop | ForEach-Object {
            # El productState de SecurityCenter2 no es un estandar documentado por
            # Microsoft; es la convencion (no oficial pero ampliamente usada, incluye
            # Windows Defender) donde el 2do y 3er byte hex indican habilitado/actualizado.
            $estadoHex = '{0:X6}' -f [int]$_.productState
            $bytesActivo = $estadoHex.Substring(2, 2)
            $bytesActualizado = $estadoHex.Substring(4, 2)
            $productos += @{
                nombre = $_.displayName
                habilitado = $bytesActivo -in @('10', '11')
                actualizado = $bytesActualizado -eq '00'
            }
        }
    }
    catch {
        LogWarning "No se pudo consultar antivirus (root/SecurityCenter2): $_"
    }
    return $productos
}

function Get-FirewallStatus {
    $perfiles = @()
    try {
        Get-NetFirewallProfile -ErrorAction Stop | ForEach-Object {
            $perfiles += @{
                perfil = $_.Name
                activo = [bool]$_.Enabled
            }
        }
    }
    catch {
        LogWarning "No se pudo consultar el estado del firewall (Get-NetFirewallProfile): $_"
    }
    return $perfiles
}

function Get-PciControllers {
    $controladores = @()
    try {
        Get-CimInstance Win32_PnPEntity -ErrorAction Stop | Where-Object { $_.PNPDeviceID -like "PCI\*" -and $_.Name } | ForEach-Object {
            $controladores += @{
                nombre = $_.Name
                fabricante = $_.Manufacturer
                deviceId = $_.PNPDeviceID
            }
        }
    }
    catch {
        LogWarning "No se pudo consultar controladores PCI (Win32_PnPEntity): $_"
    }
    return $controladores
}

function Get-UsbDevices {
    $dispositivos = @()
    try {
        Get-CimInstance Win32_PnPEntity -ErrorAction Stop | Where-Object { $_.PNPDeviceID -like "USB\*" -and $_.Name } | ForEach-Object {
            $dispositivos += @{
                nombre = $_.Name
                fabricante = $_.Manufacturer
                deviceId = $_.PNPDeviceID
            }
        }
    }
    catch {
        LogWarning "No se pudo consultar dispositivos USB (Win32_PnPEntity): $_"
    }
    return $dispositivos
}

function Get-SoundDevices {
    $tarjetas = @()
    try {
        Get-CimInstance Win32_SoundDevice -ErrorAction Stop | ForEach-Object {
            $tarjetas += @{
                nombre = $_.Name
                fabricante = $_.Manufacturer
            }
        }
    }
    catch {
        LogWarning "No se pudo consultar tarjetas de sonido (Win32_SoundDevice): $_"
    }
    return $tarjetas
}

function Get-PhysicalPorts {
    # Win32_PortConnector depende de la tabla SMBIOS Tipo 8, que muchos fabricantes
    # (sobre todo laptops y maquinas virtuales) no reportan - un arreglo vacio es
    # un resultado normal, no un error.
    $puertos = @()
    try {
        Get-CimInstance Win32_PortConnector -ErrorAction Stop | ForEach-Object {
            $puertos += @{
                nombre = $_.Tag
                tipo = ($_.ConnectorType -join ", ")
                descripcion = $_.ExternalReferenceDesignator
            }
        }
    }
    catch {
        LogWarning "No se pudo consultar puertos físicos (Win32_PortConnector): $_"
    }
    return $puertos
}

function Get-ExpansionSlots {
    $slots = @()
    try {
        Get-CimInstance Win32_SystemSlot -ErrorAction Stop | ForEach-Object {
            # CurrentUsage: 3 = Available (libre), 4 = In Use (usada)
            $estado = switch ($_.CurrentUsage) {
                3 { "free" }
                4 { "used" }
                default { "N/A" }
            }
            $slots += @{
                nombre = $_.SlotDesignation
                estado = $estado
                tipo = $_.SlotType
            }
        }
    }
    catch {
        LogWarning "No se pudo consultar ranuras de expansión (Win32_SystemSlot): $_"
    }
    return $slots
}

# ============================================================================
# RECOLECCIÓN DE INFORMACIÓN DE SOFTWARE
# ============================================================================

function Get-ComputerSoftware {
    $software = @{}

    try {
        Log "Recolectando información de software..."

        # Software instalado
        $apps = @()
        Get-CimInstance Win32_Product | ForEach-Object {
            $apps += @{
                nombre = $_.Name
                version = $_.Version
                fabricante = $_.Vendor
                fecha = $_.InstallDate
            }
        }

        $software.softwareInstalado = $apps | Sort-Object -Property nombre
        $software.cantidadSoftware = $apps.Count

        LogSuccess "Información de software recolectada correctamente ($($apps.Count) programas)"
        return $software
    }
    catch {
        LogWarning "Error recolectando software: $_"
        return @{
            softwareInstalado = @()
            cantidadSoftware = 0
        }
    }
}

# ============================================================================
# CONSTRUCCIÓN DE INVENTARIO COMPLETO
# ============================================================================

function Build-Inventory {
    param([object]$Config)

    $inventory = @{
        timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        timestampUnix = [long](Get-Date -UFormat %s)
        usuario = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        dominio = $env:USERDOMAIN
        computadora = $env:COMPUTERNAME
    }

    # Hardware
    if ($Config.data.includeHardware) {
        $inventory.hardware = Get-ComputerHardware
    }

    # Software
    if ($Config.data.includeSoftware) {
        $inventory.software = Get-ComputerSoftware
    }

    # Red (incluida en hardware, pero se puede separar)
    if ($Config.data.includeNetwork) {
        $inventory.red = @{
            ipPrincipal = $inventory.hardware.ipPrincipal
            macPrincipal = $inventory.hardware.macPrincipal
            adaptadores = $inventory.hardware.redAdaptadores
        }
    }

    # Hash único del equipo
    $inventory.equipoId = $env:COMPUTERNAME
    $inventory.version = "1.0"

    return $inventory
}

# ============================================================================
# FUNCIONES DE ENVÍO A SERVIDOR
# ============================================================================

function ConvertTo-FirestoreValue {
    # Convierte recursivamente un valor de PowerShell (hashtable, array, string,
    # numero, bool) al formato de "Value" que espera la REST API de Firestore.
    # Sin esto, los hashtables/arrays anidados (hardware, software, red) se
    # guardaban vacios porque solo se serializaban los campos de primer nivel.
    param($Value)

    if ($null -eq $Value) {
        return @{ nullValue = $null }
    }
    elseif ($Value -is [hashtable] -or $Value -is [System.Collections.Specialized.OrderedDictionary]) {
        $fields = @{}
        foreach ($key in $Value.Keys) {
            $fields[$key] = ConvertTo-FirestoreValue -Value $Value[$key]
        }
        return @{ mapValue = @{ fields = $fields } }
    }
    elseif ($Value -is [System.Management.Automation.PSCustomObject]) {
        # Ocurre al reintentar un envio: el inventario se recarga desde el JSON local
        # con ConvertFrom-Json, que produce PSCustomObject en vez de Hashtable.
        $fields = @{}
        foreach ($prop in $Value.PSObject.Properties) {
            $fields[$prop.Name] = ConvertTo-FirestoreValue -Value $prop.Value
        }
        return @{ mapValue = @{ fields = $fields } }
    }
    elseif ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
        $values = @($Value | ForEach-Object { ConvertTo-FirestoreValue -Value $_ })
        return @{ arrayValue = @{ values = $values } }
    }
    elseif ($Value -is [int] -or $Value -is [long]) {
        return @{ integerValue = $Value }
    }
    elseif ($Value -is [double] -or $Value -is [decimal] -or $Value -is [single]) {
        return @{ doubleValue = $Value }
    }
    elseif ($Value -is [bool]) {
        return @{ booleanValue = $Value }
    }
    else {
        return @{ stringValue = [string]$Value }
    }
}

function ConvertTo-JsonEscapedString {
    param([string]$Value)
    if ($null -eq $Value) { return "" }
    $sb = [System.Text.StringBuilder]::new()
    foreach ($ch in $Value.ToCharArray()) {
        switch ($ch) {
            '"'  { $sb.Append('\"') | Out-Null }
            '\'  { $sb.Append('\\') | Out-Null }
            "`n" { $sb.Append('\n') | Out-Null }
            "`r" { $sb.Append('\r') | Out-Null }
            "`t" { $sb.Append('\t') | Out-Null }
            default {
                if ([int]$ch -lt 0x20) {
                    $sb.Append([string]::Format("\u{0:x4}", [int]$ch)) | Out-Null
                }
                else {
                    $sb.Append($ch) | Out-Null
                }
            }
        }
    }
    return $sb.ToString()
}

function ConvertTo-FirestoreJsonValue {
    # Convierte recursivamente un FirestoreValue (salida de ConvertTo-FirestoreValue) a
    # texto JSON directamente, en vez de usar ConvertTo-Json.
    #
    # Motivo: en estructuras muy anidadas (como esta, donde cada nivel real de datos
    # se envuelve en 2-3 niveles adicionales por el formato de Firestore), ConvertTo-Json
    # de Windows PowerShell puede caer en su serializacion por reflexion de .NET para el
    # hashtable de nivel superior, devolviendo sus propiedades internas (Keys, Values,
    # Count, IsReadOnly, SyncRoot...) en vez de las claves reales del documento. Escribir
    # el JSON a mano evita ese bug por completo.
    param($Value)

    $culture = [System.Globalization.CultureInfo]::InvariantCulture

    # IMPORTANTE: cada rama devuelve el objeto Value COMPLETO de Firestore, con su
    # llave de tipo incluida (ej. {"stringValue":"x"}), no solo el valor interno ("x").
    # Firestore rechaza el documento si falta esa envoltura de tipo.
    if ($Value.ContainsKey('nullValue')) {
        return '{"nullValue":null}'
    }
    if ($Value.ContainsKey('stringValue')) {
        $s = $Value.stringValue
        if ($null -eq $s) { return '{"nullValue":null}' }
        return '{"stringValue":"' + (ConvertTo-JsonEscapedString -Value $s) + '"}'
    }
    if ($Value.ContainsKey('integerValue')) {
        # Firestore espera integerValue como string (para no perder precision en int64).
        return '{"integerValue":"' + [string]::Format($culture, "{0}", $Value.integerValue) + '"}'
    }
    if ($Value.ContainsKey('doubleValue')) {
        return '{"doubleValue":' + [string]::Format($culture, "{0}", $Value.doubleValue) + '}'
    }
    if ($Value.ContainsKey('booleanValue')) {
        return '{"booleanValue":' + $(if ($Value.booleanValue) { "true" } else { "false" }) + '}'
    }
    if ($Value.ContainsKey('mapValue')) {
        $fields = $Value.mapValue.fields
        $parts = @($fields.Keys | ForEach-Object {
            '"' + (ConvertTo-JsonEscapedString -Value $_) + '":' + (ConvertTo-FirestoreJsonValue -Value $fields[$_])
        })
        return '{"mapValue":{"fields":{' + ($parts -join ',') + '}}}'
    }
    if ($Value.ContainsKey('arrayValue')) {
        $items = $Value.arrayValue.values
        $parts = @($items | ForEach-Object { ConvertTo-FirestoreJsonValue -Value $_ })
        return '{"arrayValue":{"values":[' + ($parts -join ',') + ']}}'
    }
    return '{"nullValue":null}'
}

function ConvertTo-FirestoreRequestBody {
    param([hashtable]$FirestoreDoc)

    $parts = @($FirestoreDoc.fields.Keys | ForEach-Object {
        '"' + (ConvertTo-JsonEscapedString -Value $_) + '":' + (ConvertTo-FirestoreJsonValue -Value $FirestoreDoc.fields[$_])
    })
    return '{"fields":{' + ($parts -join ',') + '}}'
}

function Send-ToFirebase {
    param(
        [object]$Inventory,
        [object]$Config
    )

    try {
        $firebaseConfig = $Config.endpoint.firebase
        $projectId = $firebaseConfig.projectId
        $database = $firebaseConfig.database
        $apiKey = $firebaseConfig.apiKey

        # Construir URL de Firestore REST API
        $docId = $Inventory.equipoId
        $url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/%28default%29/documents/$database/$docId"

        # Preparar documento para Firestore
        $firestoreDoc = @{
            fields = @{}
        }

        foreach ($key in $Inventory.PSObject.Properties.Name) {
            $firestoreDoc.fields[$key] = ConvertTo-FirestoreValue -Value $Inventory.$key
        }

        # No se usa ConvertTo-Json aqui: con esta estructura tan anidada, en Windows
        # PowerShell puede caer en su serializacion por reflexion de .NET del hashtable
        # de nivel superior (devuelve Keys/Values/Count/SyncRoot en vez de los campos
        # reales). ConvertTo-FirestoreRequestBody arma el JSON a mano y evita ese bug.
        $body = ConvertTo-FirestoreRequestBody -FirestoreDoc $firestoreDoc

        $headers = @{
            "Content-Type" = "application/json"
        }

        Log "Enviando inventario a Firebase: $url"

        # Se usa HttpClient en lugar de Invoke-WebRequest -Method PATCH:
        # en algunos parches de .NET Framework, Invoke-WebRequest falla al enviar
        # PATCH con un UriFormatException enganoso ("no se puede analizar el nombre de host")
        # debido al mecanismo interno (reflection) que usa para habilitar ese verbo.
        Add-Type -AssemblyName System.Net.Http -ErrorAction SilentlyContinue

        $httpClient = [System.Net.Http.HttpClient]::new()
        try {
            $httpClient.Timeout = [TimeSpan]::FromSeconds(30)
            $requestUri = "$url`?key=$apiKey"
            $content = [System.Net.Http.StringContent]::new($body, [System.Text.Encoding]::UTF8, "application/json")

            $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new("PATCH"), $requestUri)
            $request.Content = $content

            $result = $httpClient.SendAsync($request).GetAwaiter().GetResult()

            if ($result.IsSuccessStatusCode) {
                LogSuccess "Inventario enviado a Firebase correctamente"
                return $true
            }
            else {
                $responseBody = $result.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                LogWarning "Firebase respondio con codigo: $($result.StatusCode) - $responseBody"
                return $false
            }
        }
        finally {
            $httpClient.Dispose()
        }
    }
    catch {
        LogError "Error enviando a Firebase: $_ (linea $($_.InvocationInfo.ScriptLineNumber))"
        return $false
    }
}

function Send-ToCustomServer {
    param(
        [object]$Inventory,
        [object]$Config
    )

    try {
        $customConfig = $Config.endpoint.custom
        $url = $customConfig.url
        $authType = $customConfig.authType
        $token = $customConfig.token

        $headers = @{
            "Content-Type" = "application/json"
        }

        if ($authType -eq "bearer") {
            $headers["Authorization"] = "Bearer $token"
        }
        elseif ($authType -eq "basic") {
            $headers["Authorization"] = "Basic $token"
        }

        $body = $Inventory | ConvertTo-Json -Depth 10

        Log "Enviando inventario a servidor personalizado: $url"

        $response = Invoke-WebRequest -Uri $url -Method POST -Body $body -Headers $headers -TimeoutSec 30

        if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 201) {
            LogSuccess "Inventario enviado al servidor personalizado correctamente"
            return $true
        }
        else {
            LogWarning "Servidor respondió con código: $($response.StatusCode)"
            return $false
        }
    }
    catch {
        LogError "Error enviando a servidor personalizado: $_"
        return $false
    }
}

# ============================================================================
# ALMACENAMIENTO LOCAL Y REINTENTOS
# ============================================================================

function Save-LocalInventory {
    param([object]$Inventory)

    try {
        $filename = "$($Inventory.equipoId)-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
        $filepath = "$DataDir\$filename"

        $Inventory | ConvertTo-Json -Depth 10 | Set-Content -Path $filepath -Force
        Log "Inventario guardado localmente en: $filepath"
        return $true
    }
    catch {
        LogError "Error guardando inventario localmente: $_"
        return $false
    }
}

function Retry-SendInventory {
    param([object]$Config)

    try {
        Log "Buscando inventarios pendientes para reintentar..."

        $pendingFiles = Get-ChildItem -Path $DataDir -Filter "*.json" -ErrorAction SilentlyContinue

        if ($pendingFiles.Count -eq 0) {
            Log "No hay inventarios pendientes"
            return
        }

        Log "Encontrados $($pendingFiles.Count) inventarios pendientes"

        foreach ($file in $pendingFiles) {
            try {
                $inventory = Get-Content -Path $file.FullName -Raw | ConvertFrom-Json
                Log "Reintentando envío para: $($file.Name)"

                $success = $false

                if ($Config.endpoint.type -eq "firebase") {
                    $success = Send-ToFirebase -Inventory $inventory -Config $Config
                }
                else {
                    $success = Send-ToCustomServer -Inventory $inventory -Config $Config
                }

                if ($success) {
                    Remove-Item -Path $file.FullName -Force
                    LogSuccess "Inventario pendiente enviado y eliminado: $($file.Name)"
                }
            }
            catch {
                LogWarning "Error procesando archivo pendiente $($file.Name): $_"
            }
        }
    }
    catch {
        LogError "Error en reintentos: $_"
    }
}

# ============================================================================
# FUNCIÓN PRINCIPAL
# ============================================================================

function Invoke-InventoryCollection {
    param([object]$Config)

    Log "=========================================="
    Log "Iniciando recolección de inventario"
    Log "=========================================="

    # Recolectar inventario
    $inventory = Build-Inventory -Config $Config

    if ($null -eq $inventory) {
        LogError "No se pudo construir el inventario"
        return $false
    }

    Log "Inventario construido correctamente"

    # Intentar enviar a servidor
    $sendSuccess = $false

    if ($Config.endpoint.type -eq "firebase") {
        $sendSuccess = Send-ToFirebase -Inventory $inventory -Config $Config
    }
    else {
        $sendSuccess = Send-ToCustomServer -Inventory $inventory -Config $Config
    }

    # Si falla, guardar localmente
    if (-not $sendSuccess) {
        LogWarning "No se pudo enviar el inventario, guardando localmente..."
        Save-LocalInventory -Inventory $inventory
    }

    # Reintentar inventarios pendientes
    Retry-SendInventory -Config $Config

    Log "=========================================="
    Log "Recolección finalizada"
    Log "=========================================="

    return $sendSuccess
}

# ============================================================================
# LIMPIEZA DE LOGS ANTIGUOS
# ============================================================================

function Clean-OldLogs {
    param([object]$Config)

    try {
        $retentionDays = $Config.logging.retentionDays
        $cutoffDate = (Get-Date).AddDays(-$retentionDays)

        Get-ChildItem -Path $LogDir -Filter "*.log" | Where-Object { $_.LastWriteTime -lt $cutoffDate } | Remove-Item -Force

        Log "Logs antiguos limpios (retención: $retentionDays días)"
    }
    catch {
        LogWarning "Error limpiando logs antiguos: $_"
    }
}

# ============================================================================
# EJECUCIÓN PRINCIPAL
# ============================================================================

try {
    # Cargar configuración
    $config = Load-Configuration

    # Ejecutar recolección
    $result = Invoke-InventoryCollection -Config $config

    # Limpiar logs antiguos
    Clean-OldLogs -Config $config

    # Salida
    if ($result) {
        exit 0
    }
    else {
        exit 1
    }
}
catch {
    LogError "Error crítico en agente: $_"
    exit 2
}
