import { useEffect } from "react";
import { useRoomContext } from "@livekit/components-react";

export default function RoomDebug() {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return;

    const log = () => {
      const remotes = Array.from(room.participants.values()).map((p) => p.identity);
      console.log("local:", room.localParticipant?.identity);
      console.log("remote participants:", remotes);
    };

    log();
    room.on("participantConnected", log);
    room.on("participantDisconnected", log);

    return () => {
      room.off("participantConnected", log);
      room.off("participantDisconnected", log);
    };
  }, [room]);

  return null;
}
