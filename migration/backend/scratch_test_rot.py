import cv2, numpy as np

def test_rotation_mapping():
    orig_h, orig_w = 1080, 1440
    # Original point: x=500, y=300
    orig = np.zeros((orig_h, orig_w), dtype=np.uint8)
    orig[300, 500] = 255
    
    rot90 = cv2.rotate(orig, cv2.ROTATE_90_CLOCKWISE)
    y_rot, x_rot = np.where(rot90 == 255)
    xr, yr = x_rot[0], y_rot[0]
    print(f"Original (500, 300) -> in 90CW: ({xr}, {yr})")
    
    # Inverse map:
    # xr = orig_h - 1 - y_orig = 1080 - 1 - 300 = 779
    # yr = x_orig = 500
    # So: x_orig = yr, y_orig = orig_h - 1 - xr
    x_back = yr
    y_back = orig_h - 1 - xr
    print(f"Back: ({x_back}, {y_back})")
    assert x_back == 500 and y_back == 300
    print("Mapping 90CW correct!")

test_rotation_mapping()
