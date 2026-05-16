import main
print(f"Main File Path: {main.__file__}")
for route in main.app.routes:
    if hasattr(route, 'path'):
        print(f"Path: {route.path}")
