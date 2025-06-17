import cv2
import mediapipe as mp
import numpy as np

mp_face_mesh = mp.solutions.face_mesh
cap = cv2.VideoCapture(1)

with mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1) as face_mesh:
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        h, w = frame.shape[:2]
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(frame_rgb)

        if results.multi_face_landmarks:
            face_landmarks = results.multi_face_landmarks[0]

            face_3d = []
            face_2d = []

            for idx in [1, 33, 263, 61, 291, 199]:  # Nose tip, eyes, mouth corners, chin
                lm = face_landmarks.landmark[idx]
                x, y = int(lm.x * w), int(lm.y * h)
                face_2d.append([x, y])
                face_3d.append([x, y, lm.z * 3000])  # Scale z for depth

            face_2d = np.array(face_2d, dtype=np.float64)
            face_3d = np.array(face_3d, dtype=np.float64)

            focal_length = w
            cam_matrix = np.array([[focal_length, 0, h / 2],
                                   [0, focal_length, w / 2],
                                   [0, 0, 1]])
            dist_coeffs = np.zeros((4, 1))

            success, rot_vec, _ = cv2.solvePnP(face_3d, face_2d, cam_matrix, dist_coeffs)
            rmat, _ = cv2.Rodrigues(rot_vec)
            angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)

            pitch, yaw, roll = angles

            # Normalize to [0, 1] range (approximate for general use)
            norm_pitch = (pitch + 1) / 2
            norm_yaw = (yaw + 1) / 2
            norm_roll = (roll + 1) / 2

            print(f"Pitch: {norm_pitch:.2f}, Yaw: {norm_yaw:.2f}, Roll: {norm_roll:.2f}")

        cv2.imshow("Head Pose", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
