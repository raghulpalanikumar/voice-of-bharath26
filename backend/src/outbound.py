import argparse
import asyncio
import os
import sys
from dotenv import load_dotenv
from livekit import api

# Load environment variables from .env.local
load_dotenv(".env.local")

async def main():
    parser = argparse.ArgumentParser(description="Trigger an outbound SIP call using LiveKit")
    parser.add_argument(
        "--to",
        required=True,
        help="Destination phone number (E.164, e.g. +1234567890) or SIP URI (e.g. sip:username@sip.linphone.org)"
    )
    parser.add_argument(
        "--room",
        default="outbound-room",
        help="LiveKit room name (defaults to 'outbound-room')"
    )
    parser.add_argument(
        "--trunk-id",
        help="SIP Trunk ID (optional, defaults to LIVEKIT_SIP_TRUNK_ID env var if set)"
    )
    parser.add_argument(
        "--identity",
        default="sip-recipient",
        help="Participant identity for the callee"
    )

    args = parser.parse_args()

    # Retrieve connection details
    url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    if not url or not api_key or not api_secret:
        print("Error: LiveKit credentials (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) must be set in .env.local")
        sys.exit(1)

    trunk_id = args.trunk_id or os.getenv("LIVEKIT_SIP_TRUNK_ID")

    print(f"Connecting to LiveKit API at {url}...")
    lk_api = api.LiveKitAPI(url=url, api_key=api_key, api_secret=api_secret)

    try:
        req = api.CreateSIPParticipantRequest()
        req.room_name = args.room
        req.participant_identity = args.identity
        req.participant_name = "Recipient"
        req.wait_until_answered = True

        destination = args.to
        if destination.startswith("sip:"):
            # Call to a SIP URI
            req.sip_call_to = destination

            # If no trunk_id is provided, try configuring an inline trunk using the host of the SIP URI
            if not trunk_id:
                parts = destination.split("@")
                if len(parts) == 2:
                    host = parts[1]
                    print(f"No trunk ID specified. Using inline SIP config for host: {host}")
                    inline_trunk = api.SIPOutboundConfig(
                        hostname=host,
                        transport=api.SIPTransport.SIP_TRANSPORT_UDP
                    )
                    req.trunk.CopyFrom(inline_trunk)
                else:
                    print("Error: Invalid SIP URI format. Must be sip:username@domain.com")
                    sys.exit(1)
            else:
                req.sip_trunk_id = trunk_id
        else:
            # Phone number call
            req.sip_call_to = destination
            if not trunk_id:
                print("Error: Trunk ID is required for dialing standard phone numbers. Specify --trunk-id or set LIVEKIT_SIP_TRUNK_ID in .env.local")
                sys.exit(1)
            req.sip_trunk_id = trunk_id

        print(f"Placing outbound call to {destination} in room '{args.room}'...")
        participant = await lk_api.sip.create_sip_participant(req)
        print(f"Call initiated successfully! Participant ID: {participant.participant_id}")

    except Exception as e:
        print(f"Error placing call: {e}")
    finally:
        await lk_api.aclose()

if __name__ == "__main__":
    asyncio.run(main())
