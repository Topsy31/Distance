# Distance From Home

Chrome extension: highlight a postcode or address on any web page and see
driving distance and time from your home, without leaving the page.

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle, top right)
3. Click **Load unpacked** and select this folder

## Set up

1. Get a Google Maps Platform API key with the **Directions API** and
   **Geocoding API** enabled — full walkthrough in the main repo's README
   (link below).
2. Click the extension's toolbar icon → **Settings**.
3. Pick **Kilometers** or **Miles**, and optionally tick **Show return
   distance** for round-trip totals. Then enter a passphrase, your API key,
   and your home address.
4. Click **Save & encrypt**.

## Use

Highlight a postcode or address on any page, click the car icon that
appears next to it, and see driving distance and time from home. Click
**Open route in Google Maps** to see the full route in a new tab. A red
badge on the toolbar icon means the extension is locked — each time you
restart your browser, unlock it again from the toolbar icon.

## Full documentation

For the complete setup guide, security model, and troubleshooting, see the
main repository: https://github.com/Topsy31/Distance
