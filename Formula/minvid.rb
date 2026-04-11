class Minvid < Formula
  desc "Drag-and-drop video compression CLI"
  homepage "https://github.com/Nunatic02/minvid"
  url "https://registry.npmjs.org/minvid/-/minvid-0.1.0.tgz"
  sha256 "PLACEHOLDER"
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
