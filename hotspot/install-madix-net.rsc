# Madix Net hotspot pages - installer for RouterOS 7
# 1) Private repository: put a GitHub token in "token".
#    Public repository: leave token empty ("").
# 2) If your hotspot folder is not "hotspot" (e.g. "flash/hotspot"), change dir below.
# 3) Paste the whole block into the MikroTik terminal.
{
:local token ""
:local dir "hotspot/"
:local base "https://raw.githubusercontent.com/sohaib23212/systems/refs/heads/claude/marhaba-hsp2c9/hotspot/madix-net/"
:local files {"login.html";"alogin.html";"status.html";"logout.html";"error.html";"errors.txt";"favicon.ico";"madix.js";"madix-config.js";"css/madix.css";"css/madix-ar.woff2";"css/madix-en.woff2";"img/madix-logo.svg"}
:foreach f in=$files do={
  :do {
    :if ([:len $token] > 0) do={
      /tool fetch url=($base . $f) http-header-field=("Authorization: token " . $token) dst-path=($dir . $f) output=file
    } else={
      /tool fetch url=($base . $f) dst-path=($dir . $f) output=file
    }
    :put ("OK   " . $f)
  } on-error={ :put ("FAIL " . $f) }
  :delay 300ms
}
:put "Madix Net: done"
}
