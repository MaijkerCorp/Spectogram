from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

base_folder_path = r"C:/Maijker Projects/Maijker-Data-Architecture/Maijker.MakeSense.Middleware/bin/Debug/net6.0/24_58_7C_C4_8A_5C"
folder_path = None

# Function to find the newest folder in the base directory
def get_newest_folder():
    global folder_path 
    try:
        if not os.path.exists(base_folder_path):
            raise FileNotFoundError(f"Base folder not found: {base_folder_path}")

        subfolders = [
            os.path.join(base_folder_path, d)
            for d in os.listdir(base_folder_path)
            if os.path.isdir(os.path.join(base_folder_path, d))
        ]

        if not subfolders:
            print("No subfolders found.")
            return None

        subfolders.sort(key=os.path.getmtime, reverse=True)
        folder_path = subfolders[0] 
        print(f"Newest folder: {folder_path}")
        return folder_path
    except Exception as e:
        print(f"Error fetching newest folder: {e}")
        return None

# Function to fetch the newest WAV file
def get_newest_wav_file():
    try:
        if not folder_path:
            if not get_newest_folder():
                return None

        wav_files = [
            f for f in os.listdir(folder_path) if f.lower().endswith('.wav')
        ]

        if not wav_files:
            print("No WAV files found.")
            return None

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
        return jsonify({"newest_file": newest_file, "folder_path": folder_path})
    return jsonify({"error": "No WAV files found"}), 404

# API to serve a WAV file by name
@app.route('/path/<filename>', methods=['GET'])
def serve_wav(filename):
    try:
        if not folder_path:
            if not get_newest_folder():
                return jsonify({"error": "No folder found"}), 404

        file_path = os.path.join(folder_path, filename)
        if not os.path.exists(file_path):
            return jsonify({"error": f"File not found: {filename}"}), 404
        return send_from_directory(folder_path, filename)
    except Exception as e:
        print(f"Error serving WAV file: {e}")
        return jsonify({"error": "Unable to serve the file"}), 500

if __name__ == "__main__":
    get_newest_folder()
    app.run(host='0.0.0.0', port=5000, debug=True)
