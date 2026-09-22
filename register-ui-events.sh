#!/bin/sh


# This script is used to register the UI events for the UI events
#
# The CasaOS core runs it once it is up, with the interpreter of the line above
# (keep it POSIX), logs its output and carries on with the other start.d scripts
# whatever it returns. It still exits 0, says on stderr and in the journal when
# the registration failed, and gives up on a bus that does not answer within 30
# seconds.

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

    if status=$(printf '%s\n' "$auth_header" | curl -fsS --max-time 30 -o /dev/null -w '%{http_code}' -X POST "$MESSAGE_BUS_URL/v2/message_bus/event_type" -H "Content-Type: application/json" -H @- -d @"$ui_message_bus_file")
    then
        echo "UI events registered"
    else
        message="Failed to register the UI events with the message bus (HTTP status ${status:-000})"
        echo "$message" >&2
        # the core throws start.d output away: the journal is where this is seen
        logger -t casaos-ui-events "$message" 2>/dev/null || true
    fi
else
    echo "Message bus URL or message json file not found" >&2
fi
