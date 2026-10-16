# Xuất bản với tên miền dusi.id.vn

1. Vào repo GitHub → Settings → Pages → Build and deployment → Source: GitHub Actions.
2. Trong Custom domain, nhập `dusi.id.vn` và Save. Với GitHub Actions, phải cấu hình tên miền tại Settings; file CNAME không thay thế bước này.
3. Nếu lần chạy đầu thất bại vì Pages chưa bật, vào Actions → Deploy portfolio to GitHub Pages → Run workflow trên main.
4. Trong iNET, đóng cửa sổ đổi Nameserver và chọn **Bản ghi** của dusi.id.vn. Giữ nameserver hiện tại nếu đó vẫn là nơi quản lý DNS có thẩm quyền.
5. Thêm các bản ghi sau (TTL mặc định hoặc 3600):

| Loại | Tên / Host | Giá trị |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | dusi146.github.io |

Thay các A/AAAA/CNAME cũ đang trỏ web cho @ hoặc www nếu chúng xung đột với cấu hình mới. Giữ nguyên MX/TXT và bản ghi email khác.

6. Chờ DNS cập nhật (có thể tới 24 giờ), sau đó bật Enforce HTTPS trong Settings → Pages.

URL chính: https://dusi.id.vn/

Mã hiện dùng đường dẫn tài sản từ gốc `/`, phù hợp tên miền riêng. Không dùng URL con `/duvansi/` làm URL chính khi chưa điều chỉnh base và đường dẫn tài sản.

Tài liệu chính thức:
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
