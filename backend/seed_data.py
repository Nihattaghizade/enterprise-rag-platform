import asyncio
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scripts.seed_data import seed_database

if __name__ == "__main__":
    asyncio.run(seed_database())
