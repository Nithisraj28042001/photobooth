import cv2
import pygame
import mediapipe as mp
from cvzone.HandTrackingModule import HandDetector
import sys

# Init camera
cap = cv2.VideoCapture(0)

# Init detectors
face_mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=False,
                                            max_num_faces=1,
                                            min_detection_confidence=0.5,
                                            min_tracking_confidence=0.5)
pose = mp.solutions.pose.Pose(min_detection_confidence=0.5,
                               min_tracking_confidence=0.5)
handDetector = HandDetector(detectionCon=0.8, maxHands=2)

# Init pygame
pygame.init()
width, height = 1280, 720
screen = pygame.display.set_mode((width, height))
pygame.display.set_caption("Pose + Face + Hand Tracker")
clock = pygame.time.Clock()

# Drawing config
GREEN = (255, 255, 0)
RED = (255, 0, 0)

# Body pose connections
POSE_CONNECTIONS = [
    (11, 12), (11, 23), (12, 24), (23, 24),  # Torso
    (11, 13), (13, 15),                     # Right arm
    (12, 14), (14, 16),                     # Left arm
    (23, 25), (25, 27),                     # Left leg
    (24, 26), (26, 28),                     # Right leg
    (27, 29), (29, 31), (27, 31),           # Left foot
    (28, 30), (30, 32), (28, 32)            # Right foot
]

# Hand connections
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),      # Thumb
    (0, 5), (5, 6), (6, 7), (7, 8),      # Index
    (5, 9), (9, 10), (10, 11), (11, 12), # Middle
    (9, 13), (13, 14), (14, 15), (15, 16), # Ring
    (13, 17), (17, 18), (18, 19), (19, 20), # Pinky
    (0, 17)
]

def draw_line(screen, points, color=GREEN, width=2):
    for p1, p2 in points:
        if p1 is not None and p2 is not None:
            pygame.draw.line(screen, color, p1, p2, width)

def get_scaled_points(lmList, scale=0.62, offset=(35, 40)):
    return [(int(x * scale) + offset[0], int(y * scale) + offset[1]) for x, y in lmList]

# Pose offset and scaling
POSE_SCALE = 0.78  # Scale only the body
OFFSET_X = -310
OFFSET_Y = -305

running = True
while running:
    success, img = cap.read()
    if not success:
        break

    img = cv2.flip(img, 1)
    cv2.imshow("Normal Webcam View", img) ##cam view
    h, w, _ = img.shape
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    # Detect face, pose, hands
    face_results = face_mesh.process(rgb)
    pose_results = pose.process(rgb)
    hands, _ = handDetector.findHands(img, draw=False)

    screen.fill((0, 0, 0))

    # Draw face
    if face_results.multi_face_landmarks:
        for face_landmarks in face_results.multi_face_landmarks:
            for lm in face_landmarks.landmark:
                x = int(lm.x * (width+200))
                y = int(lm.y * (height+200))
                pygame.draw.circle(screen, GREEN, (x, y), 1)

    # Draw pose (body only, scaled)
    if pose_results.pose_landmarks:
        landmarks = pose_results.pose_landmarks.landmark
        pose_indices = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]
        raw_points = {}

        for idx in pose_indices:
            lm = landmarks[idx]
            raw_points[idx] = (int(lm.x * w), int(lm.y * h))

        # Use midpoint between shoulders as center for scaling
        sx, sy = raw_points[11]
        dx, dy = raw_points[12]
        cx, cy = (sx + dx) // 2, (sy + dy) // 2

        points = {}
        for idx, (x, y) in raw_points.items():
            sx = int((x - cx) * POSE_SCALE + cx + OFFSET_X)
            sy = int((y - cy) * POSE_SCALE + cy + OFFSET_Y)
            points[idx] = (sx, sy)

        # Draw pose connections
        for p1, p2 in POSE_CONNECTIONS:
            if p1 in points and p2 in points:
                pygame.draw.line(screen, GREEN, points[p1], points[p2], 4)

        for pt in points.values():
            pygame.draw.circle(screen, RED, pt, 6)

    # Draw hands
    for hand in hands:
        handLms = hand['lmList']
        if handLms:
            hand_points = get_scaled_points([(x, y) for x, y, _ in handLms])
            draw_line(screen, [(hand_points[p1], hand_points[p2]) for p1, p2 in HAND_CONNECTIONS])

    pygame.display.update()
    clock.tick(30)

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    if cv2.waitKey(1) & 0xFF == ord('q'):
        running = False

cap.release()
pygame.quit()