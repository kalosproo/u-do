import { useContext } from "react";

import { StudyRoomContext } from "../context/studyRoomContext";

export const useStudyRoom = () => useContext(StudyRoomContext);
