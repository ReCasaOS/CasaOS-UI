#!/usr/bin/bash


# This script is used to register the UI events for the UI events
#
# The CasaOS core runs it at every start with /bin/sh (keep it POSIX) and stops
# running the other start.d scripts at the first one that exits non-zero, so it
# always exits 0 and says on stderr when the registration failed.

# Get the message bus URL
runtime_path="/var/run/casaos"
runtime_file="$runtime_path/message-bus.url"
secret_file="$runtime_path/internal.secret"
ui_message_bus_file="/var/lib/casaos/ui-message-bus.json"
if [ -f "$runtime_file" ] && [ -f "$ui_message_bus_file" ]
then
    MESSAGE_BUS_URL=$(cat "$runtime_file")

    # The message bus trusts a loopback caller only with the secret the gateway
    # writes at each boot. The header reaches curl on stdin, not on its command
    # line, where any local user could read it.
    auth_header=""
    if [ -r "$secret_file" ]
    then
        auth_header="Authorization: Internal $(cat "$secret_file")"
    fi

    if status=$(printf '%s\n' "$auth_header" | curl -fsS -o /dev/null -w '%{http_code}' -X POST "$MESSAGE_BUS_URL/v2/message_bus/event_type" -H "Content-Type: application/json" -H @- -d @"$ui_message_bus_file")
    then
        echo "UI events registered"
    else
        echo "Failed to register the UI events with the message bus (HTTP status ${status:-000})" >&2
    fi
else
    echo "Message bus URL or message json file not found" >&2
fi
