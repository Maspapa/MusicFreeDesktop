$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime] | Out-Null
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await-WinRT($operation, $resultType) {
    $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
    $task.GetAwaiter().GetResult()
}
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
try {
    $voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -like ($request.language + '-*') } | Select-Object -First 1
    if (-not $voice) { throw ('Missing Windows voice: ' + $request.language + '. Install it in Settings > Time and language > Speech.') }
    $synth.Voice = $voice
    $synth.Options.SpeakingRate = [double]$request.rate
    $stream = Await-WinRT ($synth.SynthesizeTextToStreamAsync([string]$request.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $reader = New-Object Windows.Storage.Streams.DataReader($stream)
    try {
        $null = Await-WinRT ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
        $bytes = New-Object byte[] ([int]$stream.Size)
        $reader.ReadBytes($bytes)
        if (-not $request.validateOnly) {
            $memory = New-Object System.IO.MemoryStream(,$bytes)
            $player = New-Object System.Media.SoundPlayer($memory)
            try { $player.PlaySync() } finally { $player.Dispose(); $memory.Dispose() }
        }
    } finally { $reader.Dispose(); $stream.Dispose() }
} finally { $synth.Dispose() }
