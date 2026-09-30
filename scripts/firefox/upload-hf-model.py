"""Uploads the staged Local AI model (scripts/firefox/stage-hf-model.js) to its
Hugging Face repository and prints the commit SHA of the repository's main
branch, which the Firefox build pins as MODEL_REVISION.

An unchanged model makes no new commit, so the SHA stays the same.

Usage: HF_TOKEN=... python scripts/firefox/upload-hf-model.py <staged dir> <repo id>
"""

import sys

from huggingface_hub import HfApi


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    folder, repo_id = sys.argv[1], sys.argv[2]
    api = HfApi()
    # The add-on downloads without a token, so the repository must be public.
    api.create_repo(repo_id, repo_type="model", private=False, exist_ok=True)
    if api.model_info(repo_id).private:
        sys.exit(
            f"{repo_id} is private, but the Firefox add-on downloads the model without a token. "
            "Make it public on huggingface.co (Settings -> Change repository visibility)."
        )
    api.upload_folder(
        repo_id=repo_id,
        repo_type="model",
        folder_path=folder,
        commit_message="Update Redacto Local AI model",
    )
    print(api.model_info(repo_id, revision="main").sha)


if __name__ == "__main__":
    main()
