function GeoBlockScreen() {
  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="w-20 h-20 flex items-center justify-center rounded-full bg-orange-50 mx-auto mb-6">
          <i className="ri-earth-line text-4xl text-orange-500"></i>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-semibold text-gray-900 mb-3">
          Service Not Available in Your Region
        </h1>

        {/* Body */}
        <p className="text-gray-500 text-sm leading-relaxed mb-8">
          PawTenant&apos;s ESA and PSD letter services are currently only available to
          residents of the <strong className="text-gray-700">United States</strong>.
          We apologize for any inconvenience.
        </p>

        {/* Divider */}
        <div className="border-t border-gray-100 pt-6 mt-2">
          <p className="text-xs text-gray-400">
            If you believe you&apos;re seeing this message in error, please reach out to{" "}
            <a
              href="mailto:hello@pawtenant.com"
              className="text-orange-500 hover:underline whitespace-nowrap"
            >
              hello@pawtenant.com
            </a>
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="absolute bottom-6 text-xs text-gray-300">
        &copy; {new Date().getFullYear()} PawTenant. All rights reserved.
      </p>
    </div>
  );
}

export default GeoBlockScreen;
