use std::{fs, io, path::Path};

// Reject devices/directories before opening, then check the actual handle too.
// O_NONBLOCK closes the Unix FIFO replacement race between stat and open: a
// FIFO with no writer must not freeze registration, cancellation or shutdown.
pub(crate) fn open_regular(path: &Path) -> io::Result<fs::File> {
    fn regular(metadata: fs::Metadata) -> io::Result<()> {
        if metadata.is_file() {
            Ok(())
        } else {
            Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Select a regular input file",
            ))
        }
    }
    regular(path.metadata()?)?;
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let file = options.open(path)?;
    regular(file.metadata()?)?;
    Ok(file)
}
