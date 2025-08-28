from app import create_app, db
from app.models import User, Company, Product, CapturedImage, ClassCount
from flask_migrate import Migrate

app = create_app()
migrate = Migrate(app, db)

@app.shell_context_processor
def make_shell_context():
    return dict(db=db, User=User, Company=Company, Product=Product, CapturedImage=CapturedImage, ClassCount=ClassCount)
