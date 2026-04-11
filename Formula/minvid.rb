class Minvid < Formula
  desc "Drag-and-drop video compression CLI"
  homepage "https://github.com/Nunatic02/minvid"
  url "https://registry.npmjs.org/@nunatic02/minvid/-/minvid-0.1.0.tgz"
  sha256 "c8d3eae160a892e32837db3dcae515e843e5383fef52b8141940c8bcf8b6d59f"
  license "MIT"

  depends_on "node"
  depends_on "ffmpeg"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match "minvid v#{version}", shell_output("#{bin}/minvid --version")
  end
end
