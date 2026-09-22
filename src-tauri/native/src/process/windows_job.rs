//! process-wrap 10's std JobObject uses kill_on_drop=false. Add an outer lifetime
//! job before its suspended-spawn/resume wrapper, retaining its existing tree waits.
use process_wrap::std::{ChildWrapper, CommandWrap, CommandWrapper};
use std::{
    io,
    os::windows::io::{AsRawHandle, BorrowedHandle, FromRawHandle, OwnedHandle},
};
use windows::Win32::{
    Foundation::HANDLE,
    System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    },
};

#[derive(Debug)]
pub(super) struct LifetimeJob(Option<OwnedHandle>);
impl LifetimeJob {
    pub(super) fn new() -> io::Result<Self> {
        // No SECURITY_ATTRIBUTES: the job handle is unnamed and non-inheritable.
        // SAFETY: no borrowed pointers; ownership is transferred exactly once to OwnedHandle.
        let job = unsafe { CreateJobObjectW(None, None) }.map_err(io::Error::other)?;
        let job = unsafe { OwnedHandle::from_raw_handle(job.0) };
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        // SAFETY: the structure pointer/size match the requested information class.
        unsafe {
            SetInformationJobObject(
                HANDLE(job.as_raw_handle()),
                JobObjectExtendedLimitInformation,
                &limits as *const _ as _,
                std::mem::size_of_val(&limits) as u32,
            )
        }
        .map_err(io::Error::other)?;
        Ok(Self(Some(job)))
    }
}
impl CommandWrapper for LifetimeJob {
    fn wrap_child(
        &mut self,
        mut child: Box<dyn ChildWrapper>,
        _: &CommandWrap,
    ) -> io::Result<Box<dyn ChildWrapper>> {
        let assigned = (|| {
            let job = self
                .0
                .as_ref()
                .ok_or_else(|| io::Error::other("Lifetime job already assigned"))?;
            let process = child
                .process_handle()
                .ok_or_else(|| io::Error::other("Missing process handle"))?;
            // SAFETY: handles are borrowed and valid. JobObject's pre_spawn suspended the child;
            // ordered wrap_child hooks assign this job before that wrapper resumes any thread.
            unsafe {
                AssignProcessToJobObject(
                    HANDLE(job.as_raw_handle()),
                    HANDLE(process.as_raw_handle()),
                )
            }
            .map_err(io::Error::other)
        })();
        if let Err(error) = assigned {
            let _ = child.start_kill();
            let _ = child.wait();
            return Err(error);
        }
        Ok(Box::new(LifetimeChild {
            inner: child,
            _job: self.0.take().unwrap(),
        }))
    }
}
#[derive(Debug)]
struct LifetimeChild {
    inner: Box<dyn ChildWrapper>,
    _job: OwnedHandle,
}
impl ChildWrapper for LifetimeChild {
    fn inner(&self) -> &dyn ChildWrapper {
        self.inner.as_ref()
    }
    fn inner_mut(&mut self) -> &mut dyn ChildWrapper {
        self.inner.as_mut()
    }
    fn into_inner(self: Box<Self>) -> Box<dyn ChildWrapper> {
        self.inner
    }
    fn process_handle(&self) -> Option<BorrowedHandle<'_>> {
        self.inner.process_handle()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::{
        Foundation::{GetHandleInformation, HANDLE_FLAG_INHERIT},
        System::JobObjects::QueryInformationJobObject,
    };
    #[test]
    fn lifetime_job_is_not_inheritable_and_kills_on_last_close() {
        let job = LifetimeJob::new().unwrap();
        let handle = HANDLE(job.0.as_ref().unwrap().as_raw_handle());
        let mut flags = 0;
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        unsafe {
            GetHandleInformation(handle, &mut flags).unwrap();
            QueryInformationJobObject(
                Some(handle),
                JobObjectExtendedLimitInformation,
                &mut limits as *mut _ as _,
                std::mem::size_of_val(&limits) as u32,
                None,
            )
            .unwrap();
        }
        assert_eq!(flags & HANDLE_FLAG_INHERIT.0, 0);
        assert_eq!(
            limits.BasicLimitInformation.LimitFlags & JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        );
    }
}
