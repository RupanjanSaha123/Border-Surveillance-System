import sys
print("Starting debug script...")

print("Importing config...")
from config import settings
print("Importing database...")
from database import create_db_and_tables, seed_operators, seed_settings
print("Importing auth...")
from routers import auth
print("Importing alerts...")
from routers import alerts
print("Importing drones...")
from routers import drones
print("Importing settings_router...")
from routers import settings as settings_router
print("Importing health...")
from routers import health
print("Importing cameras...")
from routers import cameras

print("SUCCESS: all routers imported.")
