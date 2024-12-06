from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Replace with the path to your folder containing WAV files
folder_path = r"C:/Maijker Projects/Maijker-Data-Architecture/Maijker.MakeSense.Middleware/bin/Debug/net6.0/24_58_7C_C4_8A_5C/2024-12-05"

# Function to fetch the newest WAV file
def get_newest_wav_file():
    try:
        # Ensure the folder exists
        if not os.path.exists(folder_path):
            raise FileNotFoundError(f"Folder not found: {folder_path}")

        # List all WAV files in the folder
        wav_files = [
            f for f in os.listdir(folder_path) if f.lower().endswith('.wav')
        ]

        if not wav_files:
            print("No WAV files found.")
            return None

        # Sort WAV files by numeric value in their name (descending)
        wav_files = sorted(
            wav_files,
            key=lambda x: float(os.path.splitext(x)[0]) if os.path.splitext(x)[0].isdigit() else 0,
            reverse=True,
        )
        print(f"Newest WAV file: {wav_files[0]}")
        return wav_files[0]
    except Exception as e:
        print(f"Error fetching WAV file: {e}")
        return None

# API to get the newest WAV file name
@app.route('/newest-wav', methods=['GET'])
def newest_wav():
    newest_file = get_newest_wav_file()
    if newest_file:
        return jsonify({"newest_file": newest_file})
    return jsonify({"error": "No WAV files found"}), 404

# API to serve a WAV file by name
@app.route('/path/<filename>', methods=['GET'])
def serve_wav(filename):
    try:
        # Ensure the file exists before serving
        file_path = os.path.join(folder_path, filename)
        if not os.path.exists(file_path):
            return jsonify({"error": f"File not found: {filename}"}), 404
        return send_from_directory(folder_path, filename)
    except Exception as e:
        print(f"Error serving WAV file: {e}")
        return jsonify({"error": "Unable to serve the file"}), 500

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)
