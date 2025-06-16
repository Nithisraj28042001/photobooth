import cv2
import pygame
import mediapipe as mp
from cvzone.HandTrackingModule import HandDetector

# Init camera
cap = cv2.VideoCapture(0)

# Init detectors
face_mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=False,
                                            max_num_faces=1,
                                            min_detection_confidence=0.5,
                                            min_tracking_confidence=0.5)
handDetector = HandDetector(detectionCon=0.8, maxHands=2)

# Init pygame
pygame.init()
width, height = 1280, 720
screen = pygame.display.set_mode((width, height))
pygame.display.set_caption("Stick Figure: Face + Hands")
clock = pygame.time.Clock()

# Drawing config
GREEN = (255, 255, 0)

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

def get_scaled_points(lmList, scale=0.62, offset=(55, 40)):
    return [(int(x * scale) + offset[0], int(y * scale) + offset[1]) for x, y in lmList]

running = True
while running:
    success, img = cap.read()
    #print("Frame read: ",success)
    if not success:
        break

    img = cv2.flip(img, 1)
    h, w, _ = img.shape
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)################################-converting to rgb as mediapipe needs rgb

    # Detect face landmarks
    face_results = face_mesh.process(rgb)

    # Detect hands
    hands, _ = handDetector.findHands(img, draw=False)

    # Clear screen
    screen.fill((0, 0, 0))

    # Draw face landmarks
    if face_results.multi_face_landmarks:
        for face_landmarks in face_results.multi_face_landmarks:
            face_points = []
            for lm in face_landmarks.landmark:
                x = int(lm.x * width)
                y = int(lm.y * height)
                face_points.append((x, y))

            for pt in face_points:
                pygame.draw.circle(screen, GREEN, pt, 1)

    # Draw hands
    for hand in hands:
        handLms = hand['lmList']  # 21 keypoints
        if handLms:
            hand_points = get_scaled_points([(x, y) for x, y, _ in handLms])
            draw_line(screen, [(hand_points[p1], hand_points[p2]) for p1, p2 in HAND_CONNECTIONS])

    pygame.display.update()
    clock.tick(30)

    # Event handling
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    if cv2.waitKey(1) & 0xFF == ord('q'):
        running = False

cap.release()
pygame.quit()